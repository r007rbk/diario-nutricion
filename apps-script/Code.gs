/**
 * Diario Nutrición Deportiva — API del Google Sheet.
 *
 * Se pega en el Sheet (Extensiones → Apps Script) y se publica como
 * "Aplicación web". La app del móvil le envía registros y este script los
 * escribe en la celda correcta SIN tocar el formato (solo el valor).
 *
 * Estructura esperada de cada pestaña de temporada (2024, 2025, 2026…):
 *   - B1: fecha de inicio (la fila 3 es B1+1, la fila 4 es B1+2…)
 *   - Fila 2: cabeceras (DÍA, GYM, ENTRENAMIENTO, BASICO, DES, MM 1, …)
 *   - Una fila por día.
 *
 * Seguridad: define la propiedad de script API_TOKEN (Configuración del
 * proyecto → Propiedades del script). La app debe enviar el mismo token.
 */

// Clave interna de la app → texto de la cabecera en la fila 2.
var SLOT_HEADERS = {
  GYM: 'GYM',
  ENT: 'ENTRENAMIENTO',
  BAS: 'BASICO',
  DES: 'DES',
  MM1: 'MM 1',
  MM2: 'MM 2',
  COM: 'COM',
  MER: 'MER',
  AE: 'AE',
  DU: 'DU',
  DE: 'DE',
  CEN: 'CEN',
  COMENT: 'COMENTARIOS'
};

// Súbelo cada vez que cambies este archivo: la app lo muestra en Ajustes → Versión.
var SCRIPT_VERSION = 7;

var HEADER_ROW = 2;
var FIRST_DAY_ROW = 3;
var MS_PER_DAY = 24 * 60 * 60 * 1000;

// ───────────────────────── Entrada HTTP ─────────────────────────

function doGet(e) {
  var p = e && e.parameter ? e.parameter : {};
  // Vuelta desde Strava tras autorizar (no lleva nuestro token: se valida con "state").
  if (p.state && (p.code || p.error) && !p.action) return stravaCallback_(p);
  return handle_(p);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'JSON inválido' });
  }
  return handle_(body);
}

function handle_(req) {
  try {
    checkToken_(req.token);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (req.action) {
      case 'ping':
        return json_({ ok: true, sheets: listSeasons_(ss), version: SCRIPT_VERSION });
      case 'day':
        return json_({ ok: true, day: readDay_(ss, req.date) });
      case 'add':
        return json_(withLock_(function () { return addEntries_(ss, req.entries || []); }));
      case 'set':
        return json_(withLock_(function () { return setCell_(ss, req.date, req.slot, req.value); }));
      case 'history':
        return json_({ ok: true, history: readHistory_(ss) });
      case 'week':
        return json_({ ok: true, week: readWeek_(ss, req.start) });
      case 'config':
        return json_({ ok: true, config: readConfig_(), overrides: readOverrides_(), version: SCRIPT_VERSION });
      case 'setConfig':
        return json_(withLock_(function () { return setConfig_(req.name, req.value); }));
      case 'stravaStatus':
        return json_({ ok: true, strava: stravaStatus_() });
      case 'stravaAuthUrl':
        return json_({ ok: true, url: stravaAuthUrl_(req.redirect) });
      case 'stravaSync':
        return json_(withLock_(function () { return stravaSync_(ss); }));
      case 'stravaMark':
        return json_(withLock_(function () { stravaMark_(req.id, req.status); return { ok: true }; }));
      case 'stravaDisconnect':
        return json_({ ok: true, strava: stravaDisconnect_() });
      case 'setGroups':
        return json_(withLock_(function () { return setGroups_(req.key, req.groups); }));
      default:
        return json_({ ok: false, error: 'Acción desconocida: ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw new Error('Falta la propiedad de script API_TOKEN');
  if (token !== expected) throw new Error('Token incorrecto');
}

function withLock_(fn) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── Acciones ─────────────────────────

/**
 * entries: [{ id, date: 'YYYY-MM-DD', slot: 'COM', line: '15:00 Paella…' }]
 * Cada línea se añade al final de la celda en una línea nueva.
 * Si la celda ya contiene exactamente esa línea (reintento de la cola
 * offline), no se duplica.
 */
function addEntries_(ss, entries) {
  var results = [];
  entries.forEach(function (entry) {
    try {
      var cell = locateCell_(ss, entry.date, entry.slot);
      var line = String(entry.line || '').trim();
      if (!line) throw new Error('Línea vacía');
      var current = String(cell.getValue() || '');
      var updated = appendLine(current, line);
      if (updated !== current) cell.setValue(updated);
      results.push({ id: entry.id, ok: true, duplicate: updated === current });
    } catch (err) {
      results.push({ id: entry.id, ok: false, error: String(err.message || err) });
    }
  });
  return { ok: true, results: results };
}

/** Sustituye el contenido completo de una celda (edición desde la app). */
function setCell_(ss, date, slot, value) {
  var cell = locateCell_(ss, date, slot);
  cell.setValue(String(value || '').replace(/\r\n/g, '\n').trim());
  return { ok: true };
}

/** Devuelve el contenido de todas las franjas de un día. */
function readDay_(ss, date) {
  var loc = locateRow_(ss, date);
  var cols = headerColumns_(loc.sheet);
  var lastCol = Math.max.apply(null, Object.keys(cols).map(function (k) { return cols[k]; }));
  var values = loc.sheet.getRange(loc.row, 1, 1, lastCol).getValues()[0];
  var slots = {};
  Object.keys(cols).forEach(function (key) {
    slots[key] = String(values[cols[key] - 1] || '');
  });
  return { date: date, sheet: loc.sheet.getName(), row: loc.row, slots: slots, menu: readMenu_(ss, date) };
}

/**
 * Lee la pestaña "ESQUEMA DE MENÚ IDEAL" para el día de la semana.
 * Devuelve { training, DES, MM2, COM, MER, CEN, DE } (solo lo que tenga texto).
 */
function readMenu_(ss, date) {
  var sh = ss.getSheets().filter(function (s) {
    return normalizeHeader(s.getName()).indexOf('MENU IDEAL') !== -1;
  })[0];
  if (!sh) return null;
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  return menuForWeekday(values, parseIsoDate_(date).getDay());
}

var MENU_ROW_PREFIXES = [
  ['DESAYUNO', 'DES'], ['MM1', 'MM1'], ['MM 1', 'MM1'], ['MM2', 'MM2'], ['MM 2', 'MM2'],
  ['COMIDA', 'COM'], ['MERIENDA', 'MER'], ['CENA', 'CEN'], ['POST', 'DE'], ['PRE', 'AE'], ['DURANTE', 'DU']
];
var WEEKDAY_NAMES = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

function menuForWeekday(values, weekday) {
  var dayRow = -1, col = -1;
  for (var r = 0; r < values.length && col === -1; r++) {
    for (var c = 0; c < values[r].length; c++) {
      if (normalizeHeader(values[r][c]) === WEEKDAY_NAMES[weekday]) { dayRow = r; col = c; break; }
    }
  }
  if (col === -1) return null;
  var menu = {};
  var training = dayRow > 0 ? String(values[dayRow - 1][col] || '').trim() : '';
  if (training) menu.training = training;
  for (var i = dayRow + 1; i < values.length; i++) {
    var label = normalizeHeader(values[i][0]);
    var text = String(values[i][col] || '').trim();
    if (!label || !text) continue;
    for (var p = 0; p < MENU_ROW_PREFIXES.length; p++) {
      if (label.indexOf(MENU_ROW_PREFIXES[p][0]) === 0) {
        var key = MENU_ROW_PREFIXES[p][1];
        menu[key] = menu[key] ? menu[key] + '\n' + text : text;
        break;
      }
    }
  }
  return menu;
}

function listSeasons_(ss) {
  return ss.getSheets().map(function (sh) {
    var start = seasonStart_(sh);
    return start ? { name: sh.getName(), start: isoDate_(start, ss) } : null;
  }).filter(Boolean);
}

// ───────────────────────── Localizar celda ─────────────────────────

function locateCell_(ss, date, slot) {
  var loc = locateRow_(ss, date);
  var cols = headerColumns_(loc.sheet);
  var col = cols[slot];
  if (!col) throw new Error('Franja desconocida: ' + slot);
  return loc.sheet.getRange(loc.row, col);
}

/**
 * Busca la pestaña de temporada y la fila del día. Las pestañas tienen más filas
 * que días de temporada (la de 2024 llega hasta 2027), así que se usa la temporada
 * más reciente que ya había empezado en esa fecha, no la primera que la contenga.
 */
function locateRow_(ss, date) {
  var target = parseIsoDate_(date);
  var seasons = ss.getSheets()
    .map(function (sh) { return { sh: sh, start: seasonStart_(sh) }; })
    .filter(function (s) { return s.start && rowForDate(s.start, target, FIRST_DAY_ROW) >= FIRST_DAY_ROW; })
    .sort(function (a, b) { return b.start - a.start; });
  for (var i = 0; i < seasons.length; i++) {
    var sh = seasons[i].sh;
    var start = seasons[i].start;
    var row = rowForDate(start, target, FIRST_DAY_ROW);
    if (row < FIRST_DAY_ROW || row > sh.getMaxRows()) continue;
    // Comprobación de seguridad: la fecha calculada en la columna B debe coincidir.
    var shown = sh.getRange(row, 2).getValue();
    if (shown instanceof Date && isoDate_(shown, ss) === date) {
      return { sheet: sh, row: row };
    }
  }
  throw new Error('No hay ninguna pestaña con la fecha ' + date);
}

/** Fecha de inicio de una pestaña de temporada (B1), o null si no lo es. */
function seasonStart_(sh) {
  var b1 = sh.getRange(1, 2).getValue();
  var b2 = normalizeHeader(sh.getRange(HEADER_ROW, 2).getValue());
  if (!(b1 instanceof Date) || b2 !== 'DIA') return null;
  return b1;
}

/** Mapa franja → número de columna, leyendo las cabeceras de la fila 2. */
function headerColumns_(sh) {
  var headers = sh.getRange(HEADER_ROW, 1, 1, sh.getLastColumn()).getValues()[0];
  return mapHeaders(headers);
}

// ───────── Funciones puras (sin Google), testeadas en tests/ ─────────

/** Mayúsculas, sin acentos y con espacios simples: "Día" → "DIA", "MENÚ" → "MENU". */
function normalizeHeader(h) {
  return String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toUpperCase().replace(/\s+/g, ' ');
}

function mapHeaders(headers) {
  var cols = {};
  Object.keys(SLOT_HEADERS).forEach(function (key) {
    var wanted = normalizeHeader(SLOT_HEADERS[key]);
    for (var i = 0; i < headers.length; i++) {
      if (normalizeHeader(headers[i]) === wanted) { cols[key] = i + 1; break; }
    }
  });
  return cols;
}

/** Fila del día: la fila 3 es B1+1, así que fila = 2 + díasDesde(B1). */
function rowForDate(start, target, firstRow) {
  var s = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  var t = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  var days = Math.round((t - s) / MS_PER_DAY);
  return firstRow - 1 + days;
}

function appendLine(current, line) {
  var existing = String(current || '').replace(/\r\n/g, '\n').trim();
  if (!existing) return line;
  var lines = existing.split('\n').map(function (l) { return l.trim(); });
  if (lines.indexOf(line.trim()) !== -1) return current;
  return existing + '\n' + line;
}

function parseIsoDate_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) throw new Error('Fecha inválida: ' + iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoDate_(d, ss) {
  return Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

// ───────────────────────── Menú ideal ─────────────────────────

/**
 * 7 días desde `start` (lunes) + la pestaña del esquema tal cual + las correcciones
 * de grupos. El cálculo de cumplimiento lo hace la app (plan.js).
 */
function readWeek_(ss, start) {
  var first = parseIsoDate_(start);
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    var iso = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    try {
      var day = readDay_(ss, iso);
      days.push({ date: iso, slots: day.slots });
    } catch (err) {
      days.push({ date: iso, slots: {}, error: String(err.message || err) });
    }
  }
  var sh = ss.getSheets().filter(function (s) {
    return normalizeHeader(s.getName()).indexOf('MENU IDEAL') !== -1;
  })[0];
  var scheme = sh ? sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues()
    .map(function (row) { return row.map(function (v) { return v instanceof Date ? '' : String(v); }); }) : null;
  return { start: start, days: days, scheme: scheme, overrides: readOverrides_() };
}

// ── Configuración de la app (listas de comida/bebida, diccionario) ──
// Se guarda en propiedades del script: no ensucia el Sheet. Cada valor ≤ 9 KB.
var CONFIG_NAME_RE = /^(PRESETS_(DES|MM1|MM2|COM|MER|AE|DU|DE|CEN|BEBIDAS|SUPLEMENTOS|LUGARES)|DICT_CUSTOM|STRAVA_SETTINGS)$/;

function readConfig_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var out = {};
  Object.keys(all).forEach(function (k) {
    if (!CONFIG_NAME_RE.test(k)) return;
    try { out[k] = JSON.parse(all[k]); } catch (e) { /* valor dañado: se ignora */ }
  });
  return out;
}

function setConfig_(name, value) {
  if (!CONFIG_NAME_RE.test(String(name))) throw new Error('Ajuste desconocido: ' + name);
  var props = PropertiesService.getScriptProperties();
  if (value === null) { props.deleteProperty(name); return { ok: true }; }
  var json = JSON.stringify(value);
  if (json.length > 9000) throw new Error('La lista es demasiado larga (' + json.length + ' caracteres, máximo 9000)');
  props.setProperty(name, json);
  return { ok: true };
}

/** Correcciones de grupos: { "poke de la esquina": ["PESCADO","CHO"] }, guardadas en el script (no en el Sheet). */
function readOverrides_() {
  var raw = PropertiesService.getScriptProperties().getProperty('GROUP_OVERRIDES');
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

var VALID_GROUPS = ['VERDURA', 'FRUTA', 'CHO', 'LACTEO', 'PESCADO', 'LEGUMBRE', 'CARNE', 'HUEVO', 'FS'];

/** groups = null borra la corrección (vuelve a usar el diccionario). */
function setGroups_(key, groups) {
  key = String(key || '').trim();
  if (!key) throw new Error('Falta la clave');
  var overrides = readOverrides_();
  if (groups === null) delete overrides[key];
  else overrides[key] = (groups || []).filter(function (g) { return VALID_GROUPS.indexOf(g) !== -1; });
  PropertiesService.getScriptProperties().setProperty('GROUP_OVERRIDES', JSON.stringify(overrides));
  return { ok: true, overrides: overrides };
}

// ───────────────────────── Strava ─────────────────────────
// Claves en Propiedades del script:
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET  → las pones tú (de strava.com/settings/api)
//   STRAVA_REFRESH_TOKEN, STRAVA_ACCESS_TOKEN, STRAVA_EXPIRES_AT, STRAVA_ATHLETE,
//   STRAVA_CONNECTED_AT, STRAVA_STATE, STRAVA_DONE → las gestiona el script

var STRAVA_OAUTH = 'https://www.strava.com/oauth/';
var STRAVA_API = 'https://www.strava.com/api/v3';
var STRAVA_DONE_MAX = 300;          // ids de actividades ya añadidas o descartadas
var STRAVA_LOOKBACK_DAYS = 7;       // se miran las actividades de la última semana
var STRAVA_NEARBY_MIN = 30;         // si ya hay algo registrado ±30 min, no se escribe sola

function props_() { return PropertiesService.getScriptProperties(); }

function stravaSettings_() {
  try { return JSON.parse(props_().getProperty('STRAVA_SETTINGS') || '{}'); } catch (e) { return {}; }
}

function stravaStatus_() {
  var p = props_();
  return {
    configured: !!(p.getProperty('STRAVA_CLIENT_ID') && p.getProperty('STRAVA_CLIENT_SECRET')),
    connected: !!p.getProperty('STRAVA_REFRESH_TOKEN'),
    athlete: p.getProperty('STRAVA_ATHLETE') || '',
    auto: !!stravaSettings_().auto
  };
}

/** URL para autorizar en Strava. redirect = la URL /exec de este script (la que tiene la app). */
function stravaAuthUrl_(redirect) {
  var p = props_();
  var clientId = p.getProperty('STRAVA_CLIENT_ID');
  if (!clientId || !p.getProperty('STRAVA_CLIENT_SECRET')) {
    throw new Error('Faltan STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET en las propiedades del script');
  }
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(String(redirect || ''))) throw new Error('URL de vuelta no válida');
  var state = Utilities.getUuid();
  p.setProperty('STRAVA_STATE', JSON.stringify({ state: state, at: Date.now() }));
  return STRAVA_OAUTH + 'authorize?client_id=' + encodeURIComponent(clientId) +
    '&response_type=code&approval_prompt=auto&scope=' + encodeURIComponent('read,activity:read_all') +
    '&redirect_uri=' + encodeURIComponent(redirect) + '&state=' + encodeURIComponent(state);
}

function stravaPage_(title, text) {
  var html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:-apple-system,system-ui,sans-serif;padding:32px 20px;text-align:center">' +
    '<h2>' + title + '</h2><p>' + text + '</p></div>';
  return HtmlService.createHtmlOutput(html).setTitle('Strava');
}

/** Strava vuelve aquí con ?code=…&state=… tras autorizar. */
function stravaCallback_(params) {
  var p = props_();
  var saved = {};
  try { saved = JSON.parse(p.getProperty('STRAVA_STATE') || '{}'); } catch (e) { /* nada */ }
  if (!saved.state || saved.state !== params.state || Date.now() - saved.at > 15 * 60 * 1000) {
    return stravaPage_('⚠︎ Enlace caducado', 'Vuelve a la app y pulsa otra vez "Conectar con Strava".');
  }
  p.deleteProperty('STRAVA_STATE');
  if (params.error) return stravaPage_('No se ha conectado', 'Has cancelado la autorización en Strava.');
  if (String(params.scope || '').indexOf('activity:read') === -1) {
    return stravaPage_('Falta un permiso', 'Hay que marcar el permiso para ver tus actividades. Vuelve a intentarlo desde la app.');
  }
  var res = UrlFetchApp.fetch(STRAVA_OAUTH + 'token', {
    method: 'post',
    payload: {
      client_id: p.getProperty('STRAVA_CLIENT_ID'),
      client_secret: p.getProperty('STRAVA_CLIENT_SECRET'),
      code: params.code,
      grant_type: 'authorization_code'
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    return stravaPage_('⚠︎ Error de Strava', 'No se pudo completar la conexión (' + res.getResponseCode() + ').');
  }
  var data = JSON.parse(res.getContentText());
  saveStravaTokens_(data);
  var a = data.athlete || {};
  p.setProperty('STRAVA_ATHLETE', [a.firstname, a.lastname].filter(Boolean).join(' '));
  p.setProperty('STRAVA_CONNECTED_AT', String(Date.now()));
  return stravaPage_('✓ Strava conectado', 'Ya puedes cerrar esta página y volver a la app.');
}

function saveStravaTokens_(data) {
  var p = props_();
  p.setProperty('STRAVA_ACCESS_TOKEN', data.access_token);
  p.setProperty('STRAVA_REFRESH_TOKEN', data.refresh_token);
  p.setProperty('STRAVA_EXPIRES_AT', String(data.expires_at));
}

/** Token de acceso válido (lo renueva si ha caducado). */
function stravaToken_() {
  var p = props_();
  var refresh = p.getProperty('STRAVA_REFRESH_TOKEN');
  if (!refresh) throw new Error('Strava no está conectado');
  var access = p.getProperty('STRAVA_ACCESS_TOKEN');
  if (access && Number(p.getProperty('STRAVA_EXPIRES_AT')) * 1000 > Date.now() + 60000) return access;
  var res = UrlFetchApp.fetch(STRAVA_OAUTH + 'token', {
    method: 'post',
    payload: {
      client_id: p.getProperty('STRAVA_CLIENT_ID'),
      client_secret: p.getProperty('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refresh
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Strava ha rechazado la conexión: vuelve a conectarlo en Ajustes');
  var data = JSON.parse(res.getContentText());
  saveStravaTokens_(data);
  return data.access_token;
}

function stravaDone_() {
  try { return JSON.parse(props_().getProperty('STRAVA_DONE') || '[]'); } catch (e) { return []; }
}

function stravaMark_(id, status) {
  var done = stravaDone_().filter(function (d) { return String(d.id) !== String(id); });
  done.push({ id: String(id), status: status || 'added' });
  props_().setProperty('STRAVA_DONE', JSON.stringify(done.slice(-STRAVA_DONE_MAX)));
}

/**
 * Mira las actividades recientes. Con "escribir solo" activado, las escribe en el Sheet
 * (salvo si ya hay algo registrado a esa hora). Devuelve lo que queda por confirmar.
 * También se puede programar como activador por horas (función stravaSincronizar).
 */
function stravaSync_(ss) {
  var status = stravaStatus_();
  if (!status.connected) return { ok: true, strava: status, pending: [], written: [] };
  var connectedAt = Number(props_().getProperty('STRAVA_CONNECTED_AT')) || Date.now();
  var after = Math.max(Date.now() - STRAVA_LOOKBACK_DAYS * 86400000, connectedAt - 2 * 86400000);
  var res = UrlFetchApp.fetch(STRAVA_API + '/athlete/activities?per_page=30&after=' + Math.floor(after / 1000), {
    headers: { Authorization: 'Bearer ' + stravaToken_() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Strava respondió ' + res.getResponseCode());
  var done = {};
  stravaDone_().forEach(function (d) { done[d.id] = true; });
  var pending = [];
  var written = [];
  JSON.parse(res.getContentText())
    .filter(function (a) { return !done[String(a.id)]; })
    .map(stravaToEntry)
    .sort(function (a, b) { return (a.date + ('0' + a.time).slice(-5)).localeCompare(b.date + ('0' + b.time).slice(-5)); })
    .forEach(function (entry) {
      var cell = null;
      try { cell = locateCell_(ss, entry.date, entry.slot); } catch (e) { entry.error = String(e.message || e); }
      entry.existing = cell ? String(cell.getValue() || '') : '';
      if (status.auto && cell && !hasNearbyLine(entry.existing, entry.time, STRAVA_NEARBY_MIN)) {
        cell.setValue(appendLine(entry.existing, entry.line));
        stravaMark_(entry.id, 'auto');
        written.push(entry);
      } else {
        pending.push(entry);
      }
    });
  return { ok: true, strava: status, pending: pending, written: written };
}

/** Para un activador por horas (Activadores → stravaSincronizar): solo tiene efecto con "escribir solo". */
function stravaSincronizar() {
  if (!stravaStatus_().auto) return;
  stravaSync_(SpreadsheetApp.getActiveSpreadsheet());
}

function stravaDisconnect_() {
  var p = props_();
  var access = p.getProperty('STRAVA_ACCESS_TOKEN');
  if (access) {
    UrlFetchApp.fetch(STRAVA_OAUTH + 'deauthorize', { method: 'post', payload: { access_token: access }, muteHttpExceptions: true });
  }
  ['STRAVA_ACCESS_TOKEN', 'STRAVA_REFRESH_TOKEN', 'STRAVA_EXPIRES_AT', 'STRAVA_ATHLETE', 'STRAVA_CONNECTED_AT']
    .forEach(function (k) { p.deleteProperty(k); });
  return stravaStatus_();
}

// Tipo de actividad de Strava → [franja, nombre como lo escribes tú]
var STRAVA_TYPES = {
  Run: ['ENT', 'Carrera'], TrailRun: ['ENT', 'Trail'], VirtualRun: ['ENT', 'Carrera en cinta'],
  Ride: ['ENT', 'Bici'], GravelRide: ['ENT', 'Bici gravel'], MountainBikeRide: ['ENT', 'Bici de montaña'],
  VirtualRide: ['ENT', 'Rodillo'], EBikeRide: ['ENT', 'Bici eléctrica'], EMountainBikeRide: ['ENT', 'Bici eléctrica'],
  Swim: ['ENT', 'Natación'], Rowing: ['ENT', 'Remo'], VirtualRow: ['ENT', 'Remo'],
  Walk: ['BAS', 'Caminar'], Hike: ['BAS', 'Senderismo'],
  WeightTraining: ['GYM', 'Fuerza'], Workout: ['GYM', 'Entrenamiento'], Crossfit: ['GYM', 'Crossfit'],
  HighIntensityIntervalTraining: ['GYM', 'HIIT'], Yoga: ['GYM', 'Yoga'], Pilates: ['GYM', 'Pilates'],
  Elliptical: ['GYM', 'Elíptica'], StairStepper: ['GYM', 'Escaleras']
};

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** Actividad de Strava → { id, date, time, slot, line, name, sport } con tu formato del Sheet. */
function stravaToEntry(a) {
  var local = String(a.start_date_local || a.start_date || '');
  var date = local.slice(0, 10);
  var time = String(Number(local.slice(11, 13))) + ':' + local.slice(14, 16);
  var sport = a.sport_type || a.type || '';
  var map = STRAVA_TYPES[sport] || ['ENT', a.name || sport];
  var slot = map[0];
  var km = (a.distance || 0) / 1000;
  var secs = a.moving_time || a.elapsed_time || 0;
  var h = Math.floor(secs / 3600);
  var m = Math.round((secs % 3600) / 60);
  if (m === 60) { h += 1; m = 0; }
  var dur = h ? h + 'h' + (m ? pad2_(m) + 'min' : '') : m + 'min';
  var round = function (x, d) { return String(Math.round(x * Math.pow(10, d)) / Math.pow(10, d)); };
  var parts = [time, map[1]];
  if (slot === 'BAS') {
    if (km >= 0.1) parts.push(round(km, 2) + 'km');
    parts.push('(' + h + ':' + pad2_(m) + ')');
  } else if (slot === 'GYM') {
    parts.push(dur);
  } else {
    if (km >= 0.1) parts.push(round(km, 1) + 'Km');
    parts.push(dur);
    if (/Run$/.test(sport) && km >= 0.5) {
      var pace = Math.round(secs / km);
      parts.push('ritmo ' + Math.floor(pace / 60) + ':' + pad2_(pace % 60) + '/km');
    }
    if ((a.total_elevation_gain || 0) >= 30) parts.push(Math.round(a.total_elevation_gain) + 'm desnivel');
  }
  if (a.average_heartrate) parts.push('FC media ' + Math.round(a.average_heartrate));
  return { id: String(a.id), date: date, time: time, slot: slot, line: parts.join(' '), name: a.name || '', sport: sport };
}

/** ¿Hay ya en la celda una línea con hora a menos de `minutes` de `time`? */
function hasNearbyLine(cellText, time, minutes) {
  var toMin = function (t) { var m = /^(\d{1,2})[:.](\d{2})/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  var target = toMin(time);
  return String(cellText || '').split('\n').some(function (line) {
    var t = toMin(line.trim());
    return t !== null && Math.abs(t - target) <= minutes;
  });
}

// ───────────────────────── Histórico → sugerencias ─────────────────────────

var FOOD_SLOTS = ['DES', 'MM1', 'MM2', 'COM', 'MER', 'AE', 'DU', 'DE', 'CEN'];

/** Lee todas las temporadas y devuelve las sugerencias por franja. */
function readHistory_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var cells = [];
  ss.getSheets().forEach(function (sh) {
    var start = seasonStart_(sh);
    if (!start) return;
    var cols = headerColumns_(sh);
    var lastRow = sh.getLastRow();
    if (lastRow < FIRST_DAY_ROW) return;
    var values = sh.getRange(FIRST_DAY_ROW, 1, lastRow - FIRST_DAY_ROW + 1, sh.getLastColumn()).getValues();
    values.forEach(function (row, i) {
      var date = null;
      FOOD_SLOTS.forEach(function (slot) {
        var text = cols[slot] ? row[cols[slot] - 1] : '';
        if (!text || typeof text !== 'string') return;
        if (!date) {
          var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
          date = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
        }
        cells.push({ slot: slot, date: date, text: text });
      });
    });
  });
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return buildHistory(cells, today);
}

var SUPPLEMENT_RE = /\b(natalbell?|yodocefol|vitamina\s?[a-z]\d*|omega\s?3|magnesio|hierro|acido folico|creatina|colageno|melatonina|multivitaminico|proteina en polvo|whey)\b/;
var DRINK_RE = /^(vaso de agua|botella de agua|agua|coca[\s-]?cola|cocacola|refresco|fanta|aquarius|nestea|tonica|sprite|7up|gaseosa|soda|bebida isotonica|isotonica|cerveza|cana|vino|cava|sidra|vermut|cocktail|coctel)\b/;
var PLACE_RE = /^en (casa|la oficina|el trabajo|la ofi|un restaurante|restaurante|el restaurante|un bar|el bar|la playa|ruta|el coche|el tren|la universidad|un chino|un japones|la terraza)\b/;
var LEADING_ONE_RE = /^(?:(?:y|e|con|1|un|una)\s+)+(?=\D)/i;

/** Clave para agrupar variantes: minúsculas, sin acentos, sin "1 "/"un " delante. */
function itemKey(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').replace(LEADING_ONE_RE, '').trim();
}

/** Texto para mostrar: sin "1 " delante y con la primera letra en mayúscula. */
function itemLabel(s) {
  var t = String(s || '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').replace(LEADING_ONE_RE, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Palabras tras las que NO se corta ("queso de Burgos", "pan con 2 lonchas").
var NO_SPLIT_AFTER = '(?:^|\\s)(?:\\p{Lu}\\p{L}*|de|del|con|y|e|a|al|en|por|para|sin|entre|cada|la|el|los|las|unos|unas)';
// "Cafe con leche Pan integral" → corta antes de una palabra en mayúscula.
var CAPITAL_SPLIT_RE = new RegExp('(?<=\\p{Ll})(?<!' + NO_SPLIT_AFTER + ')\\s+(?=\\p{Lu}\\p{Ll})', 'gu');
// "Yodocefol 1 vitamina D", "zero 1/2 pincho" → corta antes de una cantidad.
var NUMBER_SPLIT_RE = new RegExp('(?<=\\p{L})(?<!' + NO_SPLIT_AFTER.replace('\\p{Lu}\\p{L}*|', '') + ')\\s+(?=\\d+(?:/\\d+)?\\s+\\p{L})', 'gu');

/**
 * Separa una frase en elementos: por comas, por mayúscula o cantidad a mitad de frase
 * (escritura sin comas) y por " y " solo si el trozo no es un plato con "con"
 * ("pan integral con tomate y queso de burgos" queda entero).
 */
function splitPieces(sentence) {
  var out = [];
  sentence.replace(CAPITAL_SPLIT_RE, ', ').replace(NUMBER_SPLIT_RE, ', ').split(/\s*,\s*/).forEach(function (part) {
    if (!part.trim()) return;
    if (/\scon\s/i.test(part)) { out.push(part.trim()); return; }
    part.split(/\s+y\s+/i).forEach(function (p) { if (p.trim()) out.push(p.trim()); });
  });
  // Notas en mayúsculas ("LÁCTEO", "FRUTA") no son comida.
  return out.filter(function (p) { return !(p === p.toUpperCase() && /\p{L}{4}/u.test(p)); });
}

/**
 * Descompone una celda en: combos (frases con varios elementos), items (elementos
 * sueltos), bebidas, suplementos y lugares.
 */
function parseMealCell(text) {
  var out = { combos: [], items: [], bebidas: [], suplementos: [], lugares: [] };
  var push = function (list, piece) { if (itemKey(piece).length >= 2) out[list].push(piece.trim()); };
  // Una celda puede tener varias líneas y varias horas ("11:00 1 pera  12:30 1 yogur").
  String(text || '').split(/\n|\s{2,}(?=\d{1,2}[:.]\d{2}\s)/).forEach(function (chunk) {
    chunk = chunk.replace(/^\s*\d{1,2}[:.]?\d{2}\b[,.]?\s*/, '');
    // Etiquetas que escribe la app: "Bebida: agua, cerveza 0" / "Suplementos: Natalbel"
    chunk = chunk.replace(/\b(bebidas?|suplementos?)\s*:\s*([^.]*)/gi, function (m, label, list) {
      var target = /^beb/i.test(label) ? 'bebidas' : 'suplementos';
      splitPieces(list).forEach(function (p) { push(target, p); });
      return '';
    });
    chunk.split(/\.(?:\s+|$)|\.(?=\p{Lu})|;|\(|\)/u).forEach(function (sentence) {
      sentence = sentence.trim();
      if (!sentence) return;
      var parts = sentence.split(/\s*,\s*/);
      if (PLACE_RE.test(itemKey(parts[0])) && parts[0].split(/\s+/).length <= 6) {
        push('lugares', parts.shift());
        sentence = parts.join(', ').trim();
        if (!sentence) return;
      }
      var food = [];
      splitPieces(sentence).forEach(function (p) { classifyPiece(p, push, food); });
      if (food.length > 1) push('combos', food.join(', '));
      food.forEach(function (p) { push('items', p); });
    });
  });
  return out;
}

// Lo que puede seguir al nombre de una bebida: "Cerveza 0.0", "Coca Cola zero", "Aquarius de naranja".
var DRINK_TAIL_RE = /^(?:(?:zero|light|sin alcohol|sin azucar|con gas|sin gas|tostada|negra|rubia|blanco|tinto|rosado|de naranja|de limon|natural|fria|0[.,]0|0)\b\s*)+/;

/** Reparte un trozo en suplementos, bebidas o comida (food), separando mezclas. */
function classifyPiece(p, push, food) {
  var k = itemKey(p);
  var sup = SUPPLEMENT_RE.exec(k);
  if (sup) {
    // "Sobao Natalbel" → suplemento Natalbel + comida "Sobao"
    var words = p.trim().split(/\s+/);
    var supWords = sup[0].split(/\s+/).length;
    if (words.length > supWords) {
      var idx = words.findIndex(function (w) { return itemKey(w) === sup[0].split(/\s+/)[0]; });
      var rest = idx >= 0 ? words.slice(0, idx).concat(words.slice(idx + supWords)).join(' ') : '';
      // Si lo que sobra es solo una cantidad ("1 vitamina D"), se queda entero.
      if (idx >= 0 && !/^(?:\d+|un|una|unos|unas)?$/i.test(rest.trim())) {
        push('suplementos', words.slice(idx, idx + supWords).join(' '));
        classifyPiece(rest, push, food);
        return;
      }
    }
    push('suplementos', p);
    return;
  }
  var drink = DRINK_RE.exec(k);
  if (drink) {
    // Solo el nombre de la bebida y su "apellido"; lo demás vuelve a clasificarse.
    var after = k.slice(drink[0].length).replace(/^\s+/, '');
    var tail = DRINK_TAIL_RE.exec(after);
    var keep = drink[0].split(/\s+/).length + (tail ? tail[0].trim().split(/\s+/).length : 0);
    var all = p.trim().split(/\s+/);
    if (/^(?:1|un|una)$/i.test(all[0])) keep += 1;
    push('bebidas', all.slice(0, keep).join(' '));
    var restDrink = all.slice(keep).join(' ').replace(/^(?:y|con|e)\s+/i, '');
    if (restDrink.trim()) splitPieces(restDrink).forEach(function (q) { classifyPiece(q, push, food); });
    return;
  }
  food.push(p);
}

var HISTORY_LIMITS ={ combos: 12, items: 40, bebidas: 15, suplementos: 10, lugares: 8 };
var HALF_LIFE_DAYS = 120;
var RECENT_DAYS = 30;   // para el alta automática en las listas de la app

/**
 * cells: [{slot, date:'YYYY-MM-DD', text}] → { DES: {combos:[[texto, veces]], items, …}, …, ALL: {…} }
 * Puntuación = veces con más peso a lo reciente (la mitad cada 120 días).
 */
function buildHistory(cells, todayIso) {
  var today = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10));
  var acc = {};
  var add = function (slot, cat, piece, weight, recent) {
    var key = itemKey(piece);
    if (!key) return;
    // "Vitamina D" = "VitaminaD", "Natalbell" = "Natalbel"
    if (cat === 'suplementos') key = key.replace(/\s+/g, '').replace(/(\w)\1$/, '$1');
    acc[slot] = acc[slot] || {};
    acc[slot][cat] = acc[slot][cat] || {};
    var e = acc[slot][cat][key] = acc[slot][cat][key] || { score: 0, count: 0, recent: 0, variants: {} };
    e.score += weight;
    e.count += 1;
    if (recent) e.recent += 1;
    var label = itemLabel(piece);
    e.variants[label] = (e.variants[label] || 0) + 1;
  };
  cells.forEach(function (c) {
    var t = Date.UTC(+c.date.slice(0, 4), +c.date.slice(5, 7) - 1, +c.date.slice(8, 10));
    var age = Math.max(0, (today - t) / MS_PER_DAY);
    var weight = Math.pow(0.5, age / HALF_LIFE_DAYS);
    var parsed = parseMealCell(c.text);
    Object.keys(parsed).forEach(function (cat) {
      // Dentro de una misma celda, cada elemento cuenta una vez.
      var seen = {};
      parsed[cat].forEach(function (piece) {
        var k = itemKey(piece);
        if (seen[k]) return;
        seen[k] = true;
        add(c.slot, cat, piece, weight, age <= RECENT_DAYS);
        add('ALL', cat, piece, weight, age <= RECENT_DAYS);
      });
    });
  });
  var result = {};
  Object.keys(acc).forEach(function (slot) {
    result[slot] = {};
    Object.keys(HISTORY_LIMITS).forEach(function (cat) {
      var entries = acc[slot][cat] || {};
      // ALL lleva más elementos porque es lo que usa el buscador.
      var limit = slot === 'ALL' ? (cat === 'items' ? 400 : HISTORY_LIMITS[cat] * 3) : HISTORY_LIMITS[cat];
      result[slot][cat] = Object.keys(entries)
        .map(function (k) {
          var e = entries[k];
          var best = Object.keys(e.variants).sort(function (a, b) { return e.variants[b] - e.variants[a]; })[0];
          return [best, e.count, e.score, e.recent];
        })
        .sort(function (a, b) { return b[2] - a[2]; })
        .slice(0, limit)
        .map(function (r) { return [r[0], r[1], r[3]]; });   // [texto, veces, veces en los últimos 30 días]
    });
  });
  return result;
}

// ───────────────────────── Ayuda para instalar ─────────────────────────

/** Ejecútala una vez desde el editor para comprobar que encuentra el día de hoy. */
function probarHoy() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoy = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  Logger.log(JSON.stringify(readDay_(ss, hoy), null, 2));
}

// ───────────────────────── Pasar ajustes a otra hoja ─────────────────────────

var EXPORT_TAB = 'AJUSTES_APP';
// Lo que se lleva: botones, diccionario y correcciones de grupos. Nunca el token ni Strava.
var EXPORT_NAME_RE = /^(PRESETS_[A-Z0-9]+|DICT_CUSTOM|GROUP_OVERRIDES)$/;

/** En la hoja de prueba: copia los ajustes de la app a una pestaña AJUSTES_APP. */
function exportarAjustes() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var rows = Object.keys(props).filter(function (k) { return EXPORT_NAME_RE.test(k); }).sort()
    .map(function (k) { return [k, props[k]]; });
  if (!rows.length) { Logger.log('No hay ajustes que exportar.'); return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(EXPORT_TAB) || ss.insertSheet(EXPORT_TAB);
  sh.clear();
  sh.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  Logger.log('Exportados ' + rows.length + ' ajustes a la pestaña ' + EXPORT_TAB + ': ' +
    rows.map(function (r) { return r[0]; }).join(', '));
}

/** En la hoja buena, después de copiar allí la pestaña: carga los ajustes y borra la pestaña. */
function importarAjustes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheets().filter(function (s) { return s.getName().indexOf(EXPORT_TAB) >= 0; })[0];
  if (!sh) throw new Error('No encuentro la pestaña ' + EXPORT_TAB + '. Cópiala primero desde la hoja de prueba.');
  var props = {};
  sh.getDataRange().getValues().forEach(function (r) {
    var k = String(r[0]).trim();
    if (EXPORT_NAME_RE.test(k)) props[k] = String(r[1]);
  });
  var names = Object.keys(props);
  if (!names.length) throw new Error('La pestaña ' + sh.getName() + ' no tiene ajustes válidos.');
  PropertiesService.getScriptProperties().setProperties(props); // no toca API_TOKEN ni lo demás
  ss.deleteSheet(sh);
  Logger.log('Importados ' + names.length + ' ajustes y borrada la pestaña: ' + names.join(', '));
}
