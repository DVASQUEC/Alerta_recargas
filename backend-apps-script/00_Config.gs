/**
 * 00_Config.gs
 * Configuración general del entorno ALERTA RECARGAS.
 *
 * USO RECOMENDADO:
 * 1) Pega todos los archivos .gs y .html en Apps Script.
 * 2) Si el script está vinculado a la hoja, deja SPREADSHEET_ID vacío.
 * 3) Si el script es independiente, coloca aquí el ID del Google Sheets.
 */
const APP_CONFIG = {
  SPREADSHEET_ID: '1kujXjsvMPIlbfACoKPvCVvS4b-eeUsYJfFAK5wpVZ8w', // Opcional. Ejemplo: '1abcDEF...' si el script NO está vinculado al Sheet.
  SHEETS: {
    AGENCIAS: 'Agencias',
    USUARIOS: 'Usuarios',
    RECARGAS: 'Recargas',
    BITACORA: 'Bitacora_Eventos',
    PARAMETROS: 'Parametros',
    CATALOGOS: 'Catalogos'
  },
  ROLES: {
    PLACA: 'PLACA',
    SISTEMA: 'SISTEMA',
    SUPERVISOR_AGENCIA: 'SUPERVISOR_AGENCIA'
  },
  ESTADOS: {
    ABIERTA: 'ABIERTA',
    CERRADA: 'CERRADA',
    ANULADA: 'ANULADA'
  },
  ACCIONES: {
    INICIAR: 'INICIAR_RECARGA',
    FINALIZAR: 'FINALIZAR_RECARGA',
    BLOQUEADO: 'INTENTO_BLOQUEADO',
    ANULAR: 'ANULAR_RECARGA'
  },
  DEFAULT_TIMEZONE: 'America/Lima'
};

const RECARGAS_HEADERS = [
  'recarga_id', 'fecha_operativa', 'agencia_id', 'agencia', 'placa', 'usuario_creador_id',
  'inicio_recarga', 'fin_recarga', 'estado', 'duracion_min', 'tiempo_abierto_actual_min',
  'nro_recarga_dia', 'creado_en', 'cerrado_por', 'cerrado_en', 'observacion'
];

const BITACORA_HEADERS = [
  'evento_id', 'recarga_id', 'fecha_evento', 'usuario_id', 'placa', 'agencia_id', 'accion', 'detalle'
];
