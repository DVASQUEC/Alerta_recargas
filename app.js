/* =========================================================
   ALERTA RECARGAS - FRONTEND CORREGIDO PARA GITHUB PAGES
   ========================================================= */

const state = {
  session: null,
  agencias: [],
  registros: []
};

const $ = (id) => document.getElementById(id);

function setStatus(id, message = "", type = "") {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.className = `status-message ${type}`.trim();
}

/*
 * Apps Script + GitHub Pages:
 * Se usa JSONP para evitar bloqueos CORS.
 */
function api(accion, parametros = {}) {
  return new Promise((resolve, reject) => {
    const apiUrl = window.APP_CONFIG?.API_URL;

    if (!apiUrl || apiUrl.includes("PEGA_AQUI")) {
      reject(new Error("Debes colocar la URL real de Apps Script en config.js."));
      return;
    }

    const callbackName =
      `alertaRecargasCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const script = document.createElement("script");
    const url = new URL(apiUrl);

    url.searchParams.set("accion", accion);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_t", Date.now().toString());

    Object.entries(parametros).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("El servidor no respondió. Revisa la URL /exec y los permisos del despliegue."));
    }, 20000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (respuesta) => {
      cleanup();
      resolve(respuesta);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo conectar con Apps Script."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function handleLogin(event) {
  event.preventDefault();

  const codigo = $("codigoAcceso").value.trim();
  const button = $("btnIngresar");

  if (!codigo) {
    setStatus("loginStatus", "Ingrese su código de acceso.", "error");
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Ingresando...";
    setStatus("loginStatus", "Validando acceso...");

    const result = await api("login", { codigo });

    if (!result?.ok) {
      throw new Error(result?.mensaje || "Código de acceso incorrecto.");
    }

    state.session = result;
    state.agencias = result.agencias || [];

    localStorage.setItem(
      "alertaRecargasSession",
      JSON.stringify(result)
    );

    renderSession();
    showDashboard();
    await loadDashboard();

  } catch (error) {
    console.error(error);
    setStatus("loginStatus", error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Ingresar";
  }
}

function renderSession() {
  const usuario = state.session?.usuario || {};
  $("usuarioNombre").textContent = usuario.nombre || usuario.usuario || "Usuario";
  $("usuarioRol").textContent = usuario.rol || "";

  const select = $("fAgencia");
  if (!select) return;

  select.innerHTML = '<option value="">Todas las agencias</option>';

  (state.session?.agencias || []).forEach((agencia) => {
    const option = document.createElement("option");
    option.value = agencia.agencia_id || agencia.id || agencia.agencia || "";
    option.textContent = agencia.agencia || agencia.nombre || option.value;
    select.appendChild(option);
  });

  if (usuario.agencia_id) select.value = usuario.agencia_id;
}

function showDashboard() {
  $("loginView").classList.add("hidden");
  $("dashboardView").classList.remove("hidden");
}

function logout() {
  localStorage.removeItem("alertaRecargasSession");
  state.session = null;
  state.agencias = [];
  state.registros = [];

  $("dashboardView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("loginForm").reset();
  setStatus("loginStatus");
  $("codigoAcceso").focus();
}

async function loadDashboard() {
  try {
    const result = await api("dashboard", {
      agencia: $("fAgencia")?.value || ""
    });

    if (!result?.ok) {
      throw new Error(result?.mensaje || "No fue posible cargar el dashboard.");
    }

    const data = result.data || result;
    renderMetrics(data);
    renderRows(data.registros || data.historial || []);

  } catch (error) {
    console.error(error);
    renderMetrics({});
    renderRows([]);
    setStatus("recargaStatus", error.message, "error");
  }
}

function renderMetrics(data) {
  $("totalRecargas").textContent = data.totalRecargas ?? data.total_recargas ?? 0;
  $("recargasAbiertas").textContent = data.recargasAbiertas ?? data.recargas_abiertas ?? 0;
  $("recargasCerradas").textContent = data.recargasCerradas ?? data.recargas_cerradas ?? 0;
  $("promedioDuracion").textContent =
    `${data.promedioDuracion ?? data.promedio_duracion ?? 0} min`;
  $("mayorTiempo").textContent =
    `${data.mayorTiempoAbierto ?? data.mayor_tiempo_abierto ?? 0} min`;
}

function renderRows(rows = []) {
  const body = $("historyBody");
  if (!body) return;

  state.registros = Array.isArray(rows) ? rows : [];
  $("historyCount").textContent = `${state.registros.length} registros`;

  if (!state.registros.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-row">Sin registros para mostrar.</td>
      </tr>`;
    return;
  }

  body.innerHTML = state.registros.map((row) => {
    const estado = row.estado || "—";
    const tiempo =
      row.tiempo_abierto_actual_min ??
      row.duracion_min ??
      row.tiempo ??
      0;

    const recargaId = row.recarga_id || row.id || "";

    const accion =
      estado === "ABIERTA"
        ? `<button type="button" class="table-button"
             onclick="finishRecharge('${escapeHtml(recargaId)}')">
             Finalizar
           </button>`
        : "—";

    return `
      <tr>
        <td>${escapeHtml(row.placa || "—")}</td>
        <td>${escapeHtml(row.agencia || "—")}</td>
        <td><span class="badge ${escapeHtml(estado)}">${escapeHtml(estado)}</span></td>
        <td>${escapeHtml(row.inicio_recarga || row.inicio || "—")}</td>
        <td>${escapeHtml(row.fin_recarga || row.fin || "—")}</td>
        <td>${escapeHtml(tiempo)} min</td>
        <td>${escapeHtml(row.nro_recarga_dia || "—")}</td>
        <td>${accion}</td>
      </tr>`;
  }).join("");
}

async function startRecharge() {
  const placa = $("placaInput").value.trim();

  if (!placa) {
    setStatus("recargaStatus", "Ingrese la placa.", "error");
    return;
  }

  try {
    setStatus("recargaStatus", "Registrando inicio de recarga...");

    const result = await api("iniciarRecarga", {
      placa,
      agencia: $("fAgencia").value,
      observacion: $("observacionInput").value.trim(),
      codigo: state.session?.usuario?.codigo_acceso || ""
    });

    if (!result?.ok) {
      throw new Error(result?.mensaje || "No fue posible iniciar la recarga.");
    }

    setStatus(
      "recargaStatus",
      result.mensaje || "Recarga iniciada correctamente.",
      "success"
    );

    $("observacionInput").value = "";
    await loadDashboard();

  } catch (error) {
    setStatus("recargaStatus", error.message, "error");
  }
}

async function finishRecharge(recargaId = "") {
  const placa = $("placaInput").value.trim();

  if (!recargaId && !placa) {
    setStatus(
      "recargaStatus",
      "Ingrese la placa o seleccione una recarga abierta.",
      "error"
    );
    return;
  }

  try {
    setStatus("recargaStatus", "Finalizando recarga...");

    const result = await api("finalizarRecarga", {
      recarga_id: recargaId,
      placa,
      agencia: $("fAgencia").value,
      observacion: $("observacionInput").value.trim(),
      codigo: state.session?.usuario?.codigo_acceso || ""
    });

    if (!result?.ok) {
      throw new Error(result?.mensaje || "No fue posible finalizar la recarga.");
    }

    setStatus(
      "recargaStatus",
      result.mensaje || "Recarga finalizada correctamente.",
      "success"
    );

    $("observacionInput").value = "";
    await loadDashboard();

  } catch (error) {
    setStatus("recargaStatus", error.message, "error");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function restoreSession() {
  const saved = localStorage.getItem("alertaRecargasSession");
  if (!saved) return;

  try {
    state.session = JSON.parse(saved);
    renderSession();
    showDashboard();
    loadDashboard();
  } catch {
    localStorage.removeItem("alertaRecargasSession");
  }
}

$("loginForm")?.addEventListener("submit", handleLogin);
$("btnSalir")?.addEventListener("click", logout);
$("btnActualizar")?.addEventListener("click", loadDashboard);
$("fAgencia")?.addEventListener("change", loadDashboard);
$("btnIniciarRecarga")?.addEventListener("click", startRecharge);
$("btnFinalizarRecarga")?.addEventListener("click", () => finishRecharge(""));

restoreSession();
