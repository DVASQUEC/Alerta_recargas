# ALERTA RECARGAS — GitHub Pages + Google Apps Script

Repositorio preparado para publicarse en:

`https://peru-bu.github.io/alertas-recarga/`

## 1. Configurar Google Apps Script

1. Abre la hoja de Google Sheets.
2. Entra a **Extensiones > Apps Script**.
3. Crea y pega estos archivos de `backend-apps-script/`:
   - `00_Config.gs`
   - `01_LibRecargas.gs`
   - `02_Api.gs`
   - `appsscript.json`
4. En `00_Config.gs`, coloca el ID del Google Sheet en `SPREADSHEET_ID` si el script no está vinculado directamente a la hoja.
5. Implementa como **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona** o la opción autorizada por tu organización.
6. Copia la URL terminada en `/exec`.

Prueba la API abriendo:

`TU_URL_EXEC?action=health`

Debe responder con `ok: true`.

## 2. Configurar GitHub Pages

1. Abre `config.js`.
2. Reemplaza `API_URL` por la URL `/exec` de Apps Script.
3. Sube a la raíz del repositorio:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
4. En GitHub: **Settings > Pages > Deploy from a branch > main > /root**.

## 3. Estructura requerida en Google Sheets

Hojas:

- `Agencias`
- `Usuarios`
- `Recargas`
- `Bitacora_Eventos`
- `Parametros`
- `Catalogos`

Encabezados de `Recargas`:

`recarga_id, fecha_operativa, agencia_id, agencia, placa, usuario_creador_id, inicio_recarga, fin_recarga, estado, duracion_min, tiempo_abierto_actual_min, nro_recarga_dia, creado_en, cerrado_por, cerrado_en, observacion`

## 4. Actualizaciones

Después de modificar Apps Script, edita la implementación y crea una **Nueva versión**. La URL `/exec` puede mantenerse igual.

## Nota de seguridad

El frontend usa JSONP para compatibilidad entre GitHub Pages y Apps Script. No publiques códigos de acceso en el repositorio. Para un entorno sensible conviene migrar a autenticación Google Workspace o a un backend con tokens.
