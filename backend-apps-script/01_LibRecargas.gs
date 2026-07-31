/**
 * 01_LibRecargas.gs
 * Biblioteca interna de acceso a datos, parámetros, validaciones y utilidades.
 */
function getSpreadsheet_() {
  if (APP_CONFIG.SPREADSHEET_ID && APP_CONFIG.SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID.trim());
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('No existe la hoja requerida: ' + name);
  return sh;
}

function getTz_() {
  return getParam_('TIMEZONE', APP_CONFIG.DEFAULT_TIMEZONE) || APP_CONFIG.DEFAULT_TIMEZONE;
}

function getParam_(key, defaultValue) {
  const rows = getRowsAsObjects_(APP_CONFIG.SHEETS.PARAMETROS);
  const found = rows.find(r => String(r.parametro || '').trim() === key);
  return found && found.valor !== '' && found.valor !== null && found.valor !== undefined ? found.valor : defaultValue;
}

function getRowsAsObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null))
    .map((row, idx) => {
      const obj = {_rowNumber: idx + 2};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function getHeaderMap_(sheetName) {
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const map = {};
  headers.forEach((h, i) => map[h] = i + 1);
  return map;
}

function normalizeCode_(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isActive_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE' || String(value).toUpperCase() === 'SI' || String(value).toUpperCase() === 'SÍ';
}

function findUserByCode_(codigoAcceso) {
  const code = normalizeCode_(codigoAcceso);
  if (!code) throw new Error('Ingresa tu código de acceso.');
  const users = getRowsAsObjects_(APP_CONFIG.SHEETS.USUARIOS);
  const user = users.find(u => normalizeCode_(u.codigo_acceso) === code && isActive_(u.activo));
  if (!user) throw new Error('Código no válido o usuario inactivo.');
  return user;
}

function getAgencyById_(agenciaId) {
  if (!agenciaId) return null;
  const agencias = getRowsAsObjects_(APP_CONFIG.SHEETS.AGENCIAS);
  return agencias.find(a => String(a.agencia_id) === String(agenciaId) && isActive_(a.activo)) || null;
}

function getActiveAgencies_() {
  return getRowsAsObjects_(APP_CONFIG.SHEETS.AGENCIAS)
    .filter(a => isActive_(a.activo))
    .map(a => ({agencia_id: a.agencia_id, agencia: a.agencia, region: a.region}));
}

function getOperationalDate_(dateObj) {
  const tz = getTz_();
  const rawHour = String(getParam_('FECHA_OPERATIVA_INICIO_HORA', '00:00'));
  const parts = rawHour.split(':');
  const cutHour = Number(parts[0] || 0);
  const cutMinute = Number(parts[1] || 0);
  const d = new Date(dateObj);
  const hour = Number(Utilities.formatDate(d, tz, 'H'));
  const minute = Number(Utilities.formatDate(d, tz, 'm'));
  if (hour < cutHour || (hour === cutHour && minute < cutMinute)) d.setDate(d.getDate() - 1);
  return new Date(Utilities.formatDate(d, tz, 'yyyy/MM/dd 00:00:00'));
}

function makeId_(prefix) {
  const tz = getTz_();
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMddHHmmss');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return prefix + stamp + rand;
}

function minutesBetween_(startDate, endDate) {
  return Math.max(0, Math.round((endDate.getTime() - new Date(startDate).getTime()) / 60000));
}

function dateToIso_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, getTz_(), 'yyyy-MM-dd HH:mm:ss');
}

function dateOnlyIso_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, getTz_(), 'yyyy-MM-dd');
}

function recargaToClient_(r) {
  const now = new Date();
  const estado = String(r.estado || '');
  const abierto = estado === APP_CONFIG.ESTADOS.ABIERTA && r.inicio_recarga ? minutesBetween_(r.inicio_recarga, now) : '';
  return {
    recarga_id: r.recarga_id,
    fecha_operativa: dateOnlyIso_(r.fecha_operativa),
    agencia_id: r.agencia_id,
    agencia: r.agencia,
    placa: r.placa,
    usuario_creador_id: r.usuario_creador_id,
    inicio_recarga: dateToIso_(r.inicio_recarga),
    fin_recarga: dateToIso_(r.fin_recarga),
    estado: r.estado,
    duracion_min: r.duracion_min,
    tiempo_abierto_actual_min: abierto,
    nro_recarga_dia: r.nro_recarga_dia,
    creado_en: dateToIso_(r.creado_en),
    cerrado_por: r.cerrado_por,
    cerrado_en: dateToIso_(r.cerrado_en),
    observacion: r.observacion || '',
    alerta: getAlertLevel_(estado, abierto)
  };
}

function getAlertLevel_(estado, minutos) {
  if (estado !== APP_CONFIG.ESTADOS.ABIERTA || minutos === '' || minutos === null) return 'NORMAL';
  const alerta = Number(getParam_('UMBRAL_ALERTA_MIN', 60));
  const critico = Number(getParam_('UMBRAL_CRITICO_MIN', 120));
  if (minutos >= critico) return 'CRITICO';
  if (minutos >= alerta) return 'ALERTA';
  return 'NORMAL';
}

function logEvent_(recargaId, usuario, accion, detalle) {
  const sh = getSheet_(APP_CONFIG.SHEETS.BITACORA);
  sh.appendRow([
    makeId_('E'),
    recargaId || '',
    new Date(),
    usuario ? usuario.usuario_id : '',
    usuario ? usuario.placa : '',
    usuario ? usuario.agencia_id : '',
    accion,
    detalle
  ]);
}

function ensureHeaders_() {
  const recargas = getSheet_(APP_CONFIG.SHEETS.RECARGAS);
  const bitacora = getSheet_(APP_CONFIG.SHEETS.BITACORA);
  if (recargas.getLastRow() === 0) recargas.appendRow(RECARGAS_HEADERS);
  if (bitacora.getLastRow() === 0) bitacora.appendRow(BITACORA_HEADERS);
}
