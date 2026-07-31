'use strict';

const state = { session: null, rows: [], debounce: null };
const $ = id => document.getElementById(id);

function setStatus(id, text, type = '') {
  const el = $(id);
  el.textContent = text || '';
  el.className = `status ${type}`.trim();
}

function setBusy(button, busy) {
  button.disabled = busy;
}

// JSONP evita problemas CORS entre GitHub Pages y Apps Script.
function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!window.APP_CONFIG?.API_URL || APP_CONFIG.API_URL.includes('PEGA_AQUI')) {
      reject(new Error('Configura API_URL en config.js.'));
      return;
    }
    const callback = `__gas_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const url = new URL(APP_CONFIG.API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('callback', callback);
    url.searchParams.set('_', Date.now());
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    const script = document.createElement('script');
    const timeout = setTimeout(() => cleanup(new Error('Tiempo de espera agotado al conectar con Apps Script.')), 25000);
    function cleanup(error, data) {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
      error ? reject(error) : resolve(data);
    }
    window[callback] = data => cleanup(null, data);
    script.onerror = () => cleanup(new Error('No se pudo conectar con Apps Script.'));
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function login() {
  const codigo = $('codigo').value.trim().toUpperCase();
  if (!codigo) return setStatus('loginStatus', 'Ingresa tu código.', 'error');
  setBusy($('btnLogin'), true);
  setStatus('loginStatus', 'Validando...');
  try {
    const res = await api('login', { codigo });
    if (!res.ok) throw new Error(res.message || 'Acceso denegado.');
    state.session = res;
    sessionStorage.setItem('alertas_codigo', codigo);
    renderSession();
    await refreshDashboard();
  } catch (err) {
    setStatus('loginStatus', err.message, 'error');
  } finally {
    setBusy($('btnLogin'), false);
  }
}

function renderSession() {
  const u = state.session.usuario;
  $('loginCard').classList.add('hidden');
  $('mainPanel').classList.remove('hidden');
  $('btnLogout').classList.remove('hidden');
  $('userName').textContent = u.nombre_usuario || u.usuario_id || u.placa;
  $('userMeta').textContent = `Rol: ${u.rol}${u.rol === 'SISTEMA' ? ' (visualiza todas las agencias)' : ''}`;
  $('agencyChip').textContent = `${u.rol === 'SISTEMA' ? 'Sistema' : u.placa || 'Usuario'} · ${u.agencia || 'Todas las agencias'}`;
  $('placaActions').classList.toggle('hidden', u.rol !== 'PLACA');
  $('filtersCard').classList.toggle('hidden', u.rol === 'PLACA');

  const select = $('fAgencia');
  select.innerHTML = '<option value="">Todas las agencias</option>';
  (state.session.agencias || []).forEach(a => {
    const option = document.createElement('option');
    option.value = a.agencia_id;
    option.textContent = a.agencia;
    select.appendChild(option);
  });
  if (u.rol === 'SUPERVISOR_AGENCIA') {
    select.value = u.agencia_id;
    select.disabled = true;
  }
}

function filters() {
  return {
    agencia_id: $('fAgencia')?.value || '',
    estado: $('fEstado')?.value || '',
    placa: $('fPlaca')?.value || ''
  };
}

async function refreshDashboard() {
  if (!state.session) return;
  setStatus('apiStatus', 'Actualizando...');
  try {
    const res = await api('dashboard', {
      codigo: state.session.usuario.codigo_acceso,
      ...filters()
    });
    if (!res.ok) throw new Error(res.message || 'No se pudo cargar la información.');
    state.rows = res.data || [];
    renderKpis(res.resumen || {});
    renderRows(state.rows);
    setStatus('apiStatus', 'Actualizado', 'ok');
  } catch (err) {
    setStatus('apiStatus', err.message, 'error');
  }
}

function renderKpis(r) {
  $('kpiTotal').textContent = r.total || 0;
  $('kpiAbiertas').textContent = r.abiertas || 0;
  $('kpiCerradas').textContent = r.cerradas || 0;
  $('kpiPromedio').textContent = r.duracion_promedio_min || 0;
  $('kpiMayor').textContent = r.mayor_tiempo_abierto_min || 0;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function renderRows(rows) {
  const list = $('cardsList');
  if (!rows.length) {
    list.innerHTML = '<div class="recarga">No hay recargas para mostrar.</div>';
    return;
  }
  list.innerHTML = rows.map(r => {
    const canFinish = r.estado === 'ABIERTA' && state.session.usuario.rol === 'PLACA' && r.placa === state.session.usuario.placa;
    return `<article class="recarga">
      <div class="recarga-head"><strong>${escapeHtml(r.placa)}</strong><span class="badge ${escapeHtml(r.estado)}">${escapeHtml(r.estado)}</span></div>
      <div class="recarga-grid">
        <div>Agencia<b>${escapeHtml(r.agencia)}</b></div>
        <div>Inicio<b>${escapeHtml(r.inicio_recarga)}</b></div>
        <div>Duración<b>${escapeHtml(r.estado === 'ABIERTA' ? r.tiempo_abierto_actual_min : r.duracion_min)} min</b></div>
        <div>Fecha<b>${escapeHtml(r.fecha_operativa)}</b></div>
        <div>N.º del día<b>${escapeHtml(r.nro_recarga_dia)}</b></div>
        <div>Alerta<b>${escapeHtml(r.alerta)}</b></div>
      </div>
      ${canFinish ? `<button class="btn danger" style="width:100%;margin-top:14px" onclick="finishRecharge('${escapeHtml(r.recarga_id)}')">Finalizar</button>` : ''}
    </article>`;
  }).join('');
}

async function startRecharge() {
  if (!confirm('¿Confirmas iniciar la recarga?')) return;
  setBusy($('btnStart'), true);
  try {
    const res = await api('start', {
      codigo: state.session.usuario.codigo_acceso,
      observacion: $('observacion').value.trim()
    });
    if (!res.ok) throw new Error(res.message);
    $('observacion').value = '';
    await refreshDashboard();
    alert(res.message);
  } catch (err) { alert(err.message); }
  finally { setBusy($('btnStart'), false); }
}

async function finishRecharge(id) {
  if (!confirm('¿Confirmas finalizar la recarga?')) return;
  try {
    const res = await api('finish', {
      codigo: state.session.usuario.codigo_acceso,
      recarga_id: id,
      observacion: $('observacion')?.value.trim() || ''
    });
    if (!res.ok) throw new Error(res.message);
    if ($('observacion')) $('observacion').value = '';
    await refreshDashboard();
    alert(res.message);
  } catch (err) { alert(err.message); }
}

function finishMine() {
  const open = state.rows.find(r => r.estado === 'ABIERTA' && r.placa === state.session.usuario.placa);
  open ? finishRecharge(open.recarga_id) : alert('No tienes una recarga abierta.');
}

function logout() {
  sessionStorage.removeItem('alertas_codigo');
  location.reload();
}

$('btnLogin').addEventListener('click', login);
$('codigo').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('btnLogout').addEventListener('click', logout);
$('btnRefresh').addEventListener('click', refreshDashboard);
$('btnStart').addEventListener('click', startRecharge);
$('btnFinishMine').addEventListener('click', finishMine);
$('fAgencia').addEventListener('change', refreshDashboard);
$('fEstado').addEventListener('change', refreshDashboard);
$('fPlaca').addEventListener('input', () => {
  clearTimeout(state.debounce);
  state.debounce = setTimeout(refreshDashboard, 450);
});

window.addEventListener('load', () => {
  const saved = sessionStorage.getItem('alertas_codigo');
  if (saved) $('codigo').value = saved;
});
