/**
 * 02_Api.gs
 * Punto de entrada para GitHub Pages. Usa JSONP para evitar CORS.
 */
function doGet(e) {
  try {
    ensureHeaders_();
    const p = (e && e.parameter) || {};
    const action = String(p.action || 'health').toLowerCase();
    let result;

    switch (action) {
      case 'login':
        result = apiLogin(p.codigo);
        break;
      case 'dashboard':
        result = apiGetDashboard(p.codigo, {
          agencia_id: p.agencia_id || '',
          estado: p.estado || '',
          placa: p.placa || ''
        });
        break;
      case 'start':
        result = apiIniciarRecarga(p.codigo, p.observacion || '');
        break;
      case 'finish':
        result = apiFinalizarRecarga(p.codigo, p.recarga_id, p.observacion || '');
        break;
      case 'annul':
        result = apiAnularRecarga(p.codigo, p.recarga_id, p.motivo || '');
        break;
      case 'health':
        result = { ok: true, app: 'ALERTA RECARGAS', timestamp: new Date().toISOString() };
        break;
      default:
        result = { ok: false, message: 'Acción no reconocida: ' + action };
    }
    return jsonp_(result, p.callback);
  } catch (err) {
    return jsonp_({ ok: false, message: err.message }, e && e.parameter && e.parameter.callback);
  }
}

function jsonp_(data, callback) {
  const cb = String(callback || '').trim();
  const json = JSON.stringify(data);
  if (!cb) {
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }
  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(cb)) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,message:'Callback inválido'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(cb + '(' + json + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function apiLogin(codigoAcceso) {
  try {
    ensureHeaders_();
    const user = findUserByCode_(codigoAcceso);
    const agencia = getAgencyById_(user.agencia_id);
    const payload = {
      ok: true,
      usuario: {
        usuario_id: user.usuario_id,
        codigo_acceso: normalizeCode_(user.codigo_acceso),
        nombre_usuario: user.nombre_usuario,
        placa: user.placa,
        agencia_id: user.agencia_id,
        agencia: agencia ? agencia.agencia : '',
        rol: user.rol
      },
      sistema: {
        nombre: getParam_('NOMBRE_SISTEMA', 'ALERTA RECARGAS'),
        timezone: getTz_(),
        diasVistaPlaca: Number(getParam_('DIAS_VISTA_PLACA', 2)),
        diasVistaSistema: Number(getParam_('DIAS_VISTA_SISTEMA', 7)),
        umbralAlerta: Number(getParam_('UMBRAL_ALERTA_MIN', 60)),
        umbralCritico: Number(getParam_('UMBRAL_CRITICO_MIN', 120))
      },
      agencias: getActiveAgencies_()
    };
    return payload;
  } catch (err) {
    return {ok: false, message: err.message};
  }
}

function apiGetDashboard(codigoAcceso, filtros) {
  try {
    const user = findUserByCode_(codigoAcceso);
    const list = getVisibleRecargas_(user, filtros || {});
    const resumen = buildResumen_(list);
    return {ok: true, data: list, resumen: resumen};
  } catch (err) {
    return {ok: false, message: err.message};
  }
}

function apiIniciarRecarga(codigoAcceso, observacion) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    ensureHeaders_();
    const user = findUserByCode_(codigoAcceso);
    if (String(user.rol) !== APP_CONFIG.ROLES.PLACA) throw new Error('Solo los usuarios PLACA pueden iniciar recargas.');
    if (!user.placa) throw new Error('El usuario no tiene placa asignada.');
    const permitirMultiple = String(getParam_('PERMITIR_MULTIPLE_ABIERTA', 'NO')).toUpperCase() === 'SI';
    if (!permitirMultiple) {
      const abierta = findOpenRechargeByPlate_(user.placa);
      if (abierta) {
        logEvent_('', user, APP_CONFIG.ACCIONES.BLOQUEADO, 'Intento de iniciar recarga con una recarga abierta: ' + abierta.recarga_id);
        throw new Error('La placa ' + user.placa + ' ya tiene una recarga ABIERTA. Primero debes finalizarla.');
      }
    }
    const agencia = getAgencyById_(user.agencia_id);
    if (!agencia) throw new Error('La agencia del usuario no existe o está inactiva.');
    const now = new Date();
    const fechaOperativa = getOperationalDate_(now);
    const recargaId = makeId_('R');
    const nroDia = getNextDailyRechargeNumber_(user.placa, fechaOperativa);
    const sh = getSheet_(APP_CONFIG.SHEETS.RECARGAS);
    sh.appendRow([
      recargaId,
      fechaOperativa,
      user.agencia_id,
      agencia.agencia,
      user.placa,
      user.usuario_id,
      now,
      '',
      APP_CONFIG.ESTADOS.ABIERTA,
      '',
      0,
      nroDia,
      now,
      '',
      '',
      observacion || ''
    ]);
    logEvent_(recargaId, user, APP_CONFIG.ACCIONES.INICIAR, 'Recarga iniciada por la placa ' + user.placa);
    return {ok: true, message: 'Recarga iniciada correctamente.', recarga_id: recargaId};
  } catch (err) {
    return {ok: false, message: err.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function apiFinalizarRecarga(codigoAcceso, recargaId, observacion) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const user = findUserByCode_(codigoAcceso);
    const sh = getSheet_(APP_CONFIG.SHEETS.RECARGAS);
    const rows = getRowsAsObjects_(APP_CONFIG.SHEETS.RECARGAS);
    const row = rows.find(r => String(r.recarga_id) === String(recargaId));
    if (!row) throw new Error('No se encontró la recarga seleccionada.');
    if (String(row.estado) !== APP_CONFIG.ESTADOS.ABIERTA) throw new Error('La recarga ya no está ABIERTA.');

    const sistemaPuedeCerrar = String(getParam_('SISTEMA_PUEDE_CERRAR', 'NO')).toUpperCase() === 'SI';
    const soloSuya = String(getParam_('ROL_PLACA_PUEDE_CERRAR_SOLO_SUYA', 'SI')).toUpperCase() === 'SI';

    const esCreador = String(row.usuario_creador_id) === String(user.usuario_id);
    const esPlacaMisma = String(row.placa) === String(user.placa);
    const esSistema = String(user.rol) === APP_CONFIG.ROLES.SISTEMA;
    const esSupervisorAgencia = String(user.rol) === APP_CONFIG.ROLES.SUPERVISOR_AGENCIA && String(user.agencia_id) === String(row.agencia_id);

    if (esSistema && !sistemaPuedeCerrar) {
      logEvent_(row.recarga_id, user, APP_CONFIG.ACCIONES.BLOQUEADO, 'Sistema intentó cerrar sin permiso.');
      throw new Error('El rol SISTEMA está configurado solo para visualización.');
    }
    if (String(user.rol) === APP_CONFIG.ROLES.PLACA && soloSuya && !(esCreador && esPlacaMisma)) {
      logEvent_(row.recarga_id, user, APP_CONFIG.ACCIONES.BLOQUEADO, 'Intento de cierre por placa distinta.');
      throw new Error('Solo la placa que inició la recarga puede finalizarla.');
    }
    if (!esCreador && !esSistema && !esSupervisorAgencia) {
      throw new Error('No tienes permisos para finalizar esta recarga.');
    }

    const now = new Date();
    const duracion = minutesBetween_(row.inicio_recarga, now);
    const header = getHeaderMap_(APP_CONFIG.SHEETS.RECARGAS);
    const rowNum = row._rowNumber;
    sh.getRange(rowNum, header.fin_recarga).setValue(now);
    sh.getRange(rowNum, header.estado).setValue(APP_CONFIG.ESTADOS.CERRADA);
    sh.getRange(rowNum, header.duracion_min).setValue(duracion);
    sh.getRange(rowNum, header.tiempo_abierto_actual_min).setValue('');
    sh.getRange(rowNum, header.cerrado_por).setValue(user.usuario_id);
    sh.getRange(rowNum, header.cerrado_en).setValue(now);
    if (observacion) sh.getRange(rowNum, header.observacion).setValue(observacion);

    logEvent_(row.recarga_id, user, APP_CONFIG.ACCIONES.FINALIZAR, 'Recarga finalizada. Duración: ' + duracion + ' min.');
    return {ok: true, message: 'Recarga finalizada correctamente. Duración: ' + duracion + ' min.'};
  } catch (err) {
    return {ok: false, message: err.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function apiAnularRecarga(codigoAcceso, recargaId, motivo) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const user = findUserByCode_(codigoAcceso);
    if (![APP_CONFIG.ROLES.SISTEMA, APP_CONFIG.ROLES.SUPERVISOR_AGENCIA].includes(String(user.rol))) {
      throw new Error('Solo SISTEMA o SUPERVISOR_AGENCIA pueden anular.');
    }
    const sh = getSheet_(APP_CONFIG.SHEETS.RECARGAS);
    const rows = getRowsAsObjects_(APP_CONFIG.SHEETS.RECARGAS);
    const row = rows.find(r => String(r.recarga_id) === String(recargaId));
    if (!row) throw new Error('No se encontró la recarga.');
    if (String(user.rol) === APP_CONFIG.ROLES.SUPERVISOR_AGENCIA && String(user.agencia_id) !== String(row.agencia_id)) {
      throw new Error('No puedes anular recargas de otra agencia.');
    }
    const header = getHeaderMap_(APP_CONFIG.SHEETS.RECARGAS);
    const now = new Date();
    sh.getRange(row._rowNumber, header.estado).setValue(APP_CONFIG.ESTADOS.ANULADA);
    sh.getRange(row._rowNumber, header.cerrado_por).setValue(user.usuario_id);
    sh.getRange(row._rowNumber, header.cerrado_en).setValue(now);
    sh.getRange(row._rowNumber, header.observacion).setValue(motivo || 'Anulado desde sistema');
    logEvent_(row.recarga_id, user, APP_CONFIG.ACCIONES.ANULAR, motivo || 'Recarga anulada');
    return {ok: true, message: 'Recarga anulada correctamente.'};
  } catch (err) {
    return {ok: false, message: err.message};
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getVisibleRecargas_(user, filtros) {
  const role = String(user.rol);
  const diasPlaca = Number(getParam_('DIAS_VISTA_PLACA', 2));
  const diasSistema = Number(getParam_('DIAS_VISTA_SISTEMA', 7));
  const dias = role === APP_CONFIG.ROLES.PLACA ? diasPlaca : diasSistema;
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - dias);
  minDate.setHours(0, 0, 0, 0);

  let rows = getRowsAsObjects_(APP_CONFIG.SHEETS.RECARGAS);
  rows = rows.filter(r => {
    const f = r.fecha_operativa instanceof Date ? r.fecha_operativa : new Date(r.fecha_operativa);
    return !isNaN(f.getTime()) && f >= minDate;
  });

  if (role === APP_CONFIG.ROLES.PLACA) {
    rows = rows.filter(r => String(r.placa) === String(user.placa));
  } else if (role === APP_CONFIG.ROLES.SUPERVISOR_AGENCIA) {
    rows = rows.filter(r => String(r.agencia_id) === String(user.agencia_id));
  } else if (role === APP_CONFIG.ROLES.SISTEMA && filtros.agencia_id) {
    rows = rows.filter(r => String(r.agencia_id) === String(filtros.agencia_id));
  }

  if (filtros.estado) rows = rows.filter(r => String(r.estado) === String(filtros.estado));
  if (filtros.placa) rows = rows.filter(r => String(r.placa).toUpperCase().indexOf(String(filtros.placa).toUpperCase()) >= 0);

  return rows
    .sort((a, b) => new Date(b.inicio_recarga).getTime() - new Date(a.inicio_recarga).getTime())
    .map(recargaToClient_);
}

function findOpenRechargeByPlate_(placa) {
  return getRowsAsObjects_(APP_CONFIG.SHEETS.RECARGAS).find(r =>
    String(r.placa) === String(placa) && String(r.estado) === APP_CONFIG.ESTADOS.ABIERTA
  );
}

function getNextDailyRechargeNumber_(placa, fechaOperativa) {
  const target = Utilities.formatDate(fechaOperativa, getTz_(), 'yyyy-MM-dd');
  const rows = getRowsAsObjects_(APP_CONFIG.SHEETS.RECARGAS).filter(r => {
    if (String(r.placa) !== String(placa)) return false;
    return dateOnlyIso_(r.fecha_operativa) === target;
  });
  const max = rows.reduce((acc, r) => Math.max(acc, Number(r.nro_recarga_dia || 0)), 0);
  return max + 1;
}

function buildResumen_(list) {
  const abiertas = list.filter(r => r.estado === APP_CONFIG.ESTADOS.ABIERTA);
  const cerradas = list.filter(r => r.estado === APP_CONFIG.ESTADOS.CERRADA);
  const duraciones = cerradas.map(r => Number(r.duracion_min || 0)).filter(n => !isNaN(n));
  const promedio = duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : 0;
  return {
    total: list.length,
    abiertas: abiertas.length,
    cerradas: cerradas.length,
    anuladas: list.filter(r => r.estado === APP_CONFIG.ESTADOS.ANULADA).length,
    criticas: list.filter(r => r.alerta === 'CRITICO').length,
    alertas: list.filter(r => r.alerta === 'ALERTA').length,
    duracion_promedio_min: promedio,
    mayor_tiempo_abierto_min: abiertas.length ? Math.max.apply(null, abiertas.map(r => Number(r.tiempo_abierto_actual_min || 0))) : 0
  };
}

/** Ejecuta esta función una vez para validar que todo esté conectado. */
function probarConexion() {
  ensureHeaders_();
  Logger.log(apiLogin('SIS001'));
}
