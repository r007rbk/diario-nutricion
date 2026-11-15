// Simula la aplicación web de Apps Script dentro del navegador para probar la app
// sin Google. Uso (consola de la app): await import('/tests/mock-backend.js')
// y en Ajustes URL = https://mock/exec, token = secreto.
// window.mockOnline = false simula estar sin conexión.
const code = await (await fetch('/apps-script/Code.gs')).text();
const fixture = await (await fetch('/tests/fixture.json')).json();
const toVal = v => (v && typeof v === 'object' && v.date)
  ? new Date(+v.date.slice(0, 4), +v.date.slice(5, 7) - 1, +v.date.slice(8, 10)) : (v ?? '');
window.mockSheets = Object.entries(fixture).map(([name, rows]) => {
  const data = rows.map(r => r.map(toVal));
  return {
    data,
    getName: () => name,
    getMaxRows: () => data.length,
    getLastColumn: () => data[0].length,
    getLastRow: () => data.length,
    getRange(row, col, nr = 1, nc = 1) {
      return {
        getValue: () => data[row - 1][col - 1],
        getValues: () => Array.from({ length: nr }, (_, i) => data[row - 1 + i].slice(col - 1, col - 1 + nc)),
        setValue: v => { data[row - 1][col - 1] = v; }
      };
    }
  };
});
const pad = n => String(n).padStart(2, '0');
const G = {
  Utilities: { formatDate: d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, getUuid: () => 'uuid-' + Math.random().toString(36).slice(2) },
  HtmlService: { createHtmlOutput: html => ({ html, setTitle() { return this; } }) },
  // Strava simulado: window.stravaFake.activities = [...]
  UrlFetchApp: { fetch(url, opts = {}) {
    const reply = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj) });
    if (url.endsWith('/oauth/token')) return reply(200, { access_token: 'A', refresh_token: 'R', expires_at: Math.floor(Date.now() / 1000) + 3600, athlete: { firstname: 'Prueba' } });
    if (url.includes('/athlete/activities')) return reply(200, window.stravaFake.activities);
    return reply(200, {});
  } },
  ContentService: { createTextOutput: s => ({ setMimeType() { return s; } }), MimeType: {} },
  LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: (() => {
    const props = window.mockProps = { API_TOKEN: 'secreto' };
    return { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) }) };
  })(),
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({ getSheets: () => window.mockSheets, getSpreadsheetTimeZone: () => 'Europe/Madrid' }),
    flush() {}
  }
};
const server = new Function(...Object.keys(G), code + '; return { doPost };')(...Object.values(G));
window.mockOnline = true;
window.stravaFake = { activities: [] };
window.mockCell = (sheet, row, col) => window.mockSheets.find(s => s.getName() === sheet).data[row - 1][col - 1];
const realFetch = window.fetch;
window.fetch = async (url, opts) => {
  if (String(url).startsWith('https://mock/')) {
    if (!window.mockOnline) throw new TypeError('Failed to fetch');
    return new Response(server.doPost({ postData: { contents: opts.body } }), { headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, opts);
};
