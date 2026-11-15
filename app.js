'use strict';

// Cambia junto con ?v= en index.html y VERSION en sw.js.
const APP_VERSION = 3;

// Si algo falla, que se vea en pantalla en lugar de no hacer nada.
window.addEventListener('error', e => toast(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', e => toast(`Error: ${e.reason && e.reason.message || e.reason}`));

// ───────────────────────── Definiciones ─────────────────────────

const SLOTS = [
  { key: 'GYM', label: 'Gym', icon: '🏋️', group: 'act', kind: 'gym' },
  { key: 'ENT', label: 'Entreno', icon: '🏃', group: 'act', kind: 'ent' },
  { key: 'BAS', label: 'Básico', icon: '🚶', group: 'act', kind: 'bas' },
  { key: 'DES', label: 'Desayuno', icon: '☕', group: 'meal', kind: 'food', harvard: true },
  { key: 'MM1', label: 'Media mañana 1', short: 'MM 1', icon: '🍎', group: 'meal', kind: 'food' },
  { key: 'MM2', label: 'Media mañana 2', short: 'MM 2', icon: '🥪', group: 'meal', kind: 'food' },
  { key: 'COM', label: 'Comida', icon: '🍽️', group: 'meal', kind: 'food', harvard: true },
  { key: 'MER', label: 'Merienda', icon: '🍌', group: 'meal', kind: 'food' },
  { key: 'CEN', label: 'Cena', icon: '🥗', group: 'meal', kind: 'food', harvard: true },
  { key: 'AE', label: 'Antes del deporte', short: 'Antes', icon: '⏱️', group: 'sport', kind: 'food' },
  { key: 'DU', label: 'Durante el deporte', short: 'Durante', icon: '💧', group: 'sport', kind: 'food' },
  { key: 'DE', label: 'Después del deporte', short: 'Después', icon: '🥛', group: 'sport', kind: 'food' },
  { key: 'COMENT', label: 'Comentario', icon: '📝', group: 'other', kind: 'note' }
];
const SLOT = Object.fromEntries(SLOTS.map(s => [s.key, s]));

const HARVARD = [
  { key: 'verdura', label: 'Verdura/fruta ½' },
  { key: 'proteína', label: 'Proteína ¼' },
  { key: 'integral', label: 'Cereal integral ¼' },
  { key: 'aceite', label: 'Aceite de oliva' },
  { key: 'agua', label: 'Agua / sin azúcar' }
];

// Campos de las actividades. type: chips (una opción + "otro" libre), num, dur, text
const ACTIVITY_FIELDS = {
  gym: [
    { id: 'tipo', label: 'Tipo', type: 'chips', options: ['Funcional', 'Fuerza', 'Pilates', 'Cyclo', 'Movilidad'] },
    { id: 'dur', label: 'Duración', type: 'dur' },
    { id: 'notas', label: 'Notas', type: 'text', placeholder: 'Ej: mucho brazo y espalda' }
  ],
  ent: [
    { id: 'deporte', label: 'Deporte', type: 'chips', options: ['Carrera', 'Bici'] },
    { id: 'tipo', label: 'Tipo', type: 'chips', options: ['base', 'series', 'tirada larga', 'técnica', 'rodaje suave', 'competición'] },
    { id: 'km', label: 'Distancia (km)', type: 'num', step: '0.01' },
    { id: 'dur', label: 'Duración', type: 'dur' },
    { id: 'desnivel', label: 'Desnivel (m)', type: 'num', step: '1' },
    { id: 'notas', label: 'Notas', type: 'text', placeholder: 'Ej: ritmo bajo' }
  ],
  bas: [
    { id: 'act', label: 'Actividad', type: 'chips', options: ['Caminar', 'Senderismo', 'Bici paseo'] },
    { id: 'lugar', label: 'Dónde', type: 'text', placeholder: 'Ej: por monte, por ciudad' },
    { id: 'km', label: 'Distancia (km)', type: 'num', step: '0.01' },
    { id: 'dur', label: 'Duración', type: 'dur' }
  ]
};

// ───────────────────────── Utilidades ─────────────────────────

const $ = sel => document.querySelector(sel);
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  }
};

const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoDate(d); };
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** "09:30" → "9:30", como lo escribes en el Sheet. */
const sheetTime = t => (t || '').replace(/^0(\d)/, '$1');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
/** Une en una línea: salto antes de minúscula → espacio; antes de mayúscula → ". " */
const clean = s => (s || '').trim()
  .replace(/[.,;]?\s*\n+\s*(?=\p{Ll})/gu, ' ')
  .replace(/\.?\s*\n+\s*/g, '. ')
  .replace(/\s{2,}/g, ' ');

function formatDur(h, m, style) {
  h = Number(h) || 0; m = Number(m) || 0;
  if (!h && !m) return '';
  if (style === 'clock') return `(${h}:${pad(m)})`;
  if (!h) return `${m}min`;
  return m ? `${h}h${pad(m)}min` : `${h}h`;
}
function formatKm(km, unit) {
  if (km === '' || km == null) return '';
  return `${String(km).replace(',', '.')}${unit}`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ───────────────────────── Estado ─────────────────────────

const state = {
  date: isoDate(new Date()),
  settings: store.get('settings', { url: '', token: '' }),
  queue: store.get('queue', []),        // [{id, op:'add'|'set', date, slot, line|value, at}]
  syncing: false,
  history: store.get('history', null),   // sugerencias del histórico, por franja
  lastError: ''
};

const dayCache = date => store.get('day:' + date, null);
const saveDayCache = (date, day) => store.set('day:' + date, day);

/** Contenido del día = lo último leído del Sheet + lo pendiente de enviar. */
function viewDay(date) {
  const cached = dayCache(date);
  const slots = Object.assign({}, cached ? cached.slots : {});
  const pending = {};
  for (const op of state.queue) {
    if (op.date !== date) continue;
    if (op.op === 'set') slots[op.slot] = op.value;
    else slots[op.slot] = slots[op.slot] ? `${slots[op.slot]}\n${op.line}` : op.line;
    pending[op.slot] = true;
  }
  return { slots, pending, menu: cached && cached.menu, known: !!cached };
}

// ───────────────────────── API (Apps Script) ─────────────────────────

async function api(payload) {
  const { url, token } = state.settings;
  if (!url) throw new Error('Falta configurar la URL en Ajustes');
  // text/plain evita la petición "preflight" de CORS que Apps Script no admite.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, ...payload }),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

const HISTORY_MAX_AGE = 6 * 60 * 60 * 1000;

/** Descarga las sugerencias del histórico (todas las temporadas). */
async function loadHistory(force) {
  if (!state.settings.url || !navigator.onLine) return;
  if (!force && Date.now() - store.get('historyAt', 0) < HISTORY_MAX_AGE) return;
  try {
    const { history } = await api({ action: 'history' });
    state.history = history;
    store.set('history', history);
    store.set('historyAt', Date.now());
    if ($('#entrySheet').open && form.slot && form.slot.kind === 'food') renderFoodSuggestions();
  } catch (err) {
    state.lastError = err.message;
    renderSync();
  }
}

async function refreshDay(date) {
  if (!state.settings.url || !navigator.onLine) return;
  try {
    const { day } = await api({ action: 'day', date });
    saveDayCache(date, day);
    if (date === state.date) render();
  } catch (err) {
    state.lastError = err.message;
    renderSync();
  }
}

function enqueue(op) {
  state.queue.push({ id: uid(), at: Date.now(), ...op });
  store.set('queue', state.queue);
  render();
  flush();
}

async function flush() {
  if (state.syncing || !state.queue.length || !navigator.onLine || !state.settings.url) { renderSync(); return; }
  state.syncing = true;
  renderSync();
  const touched = new Set();
  try {
    while (state.queue.length) {
      const op = state.queue[0];
      if (op.op === 'add') {
        const { results } = await api({ action: 'add', entries: [{ id: op.id, date: op.date, slot: op.slot, line: op.line }] });
        const r = results[0];
        if (!r.ok) throw new Error(r.error);
      } else {
        await api({ action: 'set', date: op.date, slot: op.slot, value: op.value });
      }
      touched.add(op.date);
      state.queue.shift();
      store.set('queue', state.queue);
    }
    state.lastError = '';
  } catch (err) {
    state.lastError = err.message;
  } finally {
    state.syncing = false;
  }
  for (const d of touched) await refreshDay(d);
  if (touched.size) loadHistory(true);
  render();
}

// ───────────────────────── Pantalla principal ─────────────────────────

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function render() {
  const d = parseIso(state.date);
  const isToday = state.date === isoDate(new Date());
  $('#dateText').textContent = `${isToday ? 'Hoy, ' : ''}${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  $('#dateInput').value = state.date;
  $('#goToday').hidden = isToday;

  const view = viewDay(state.date);
  const hint = view.menu && view.menu.training;
  $('#menuHint').hidden = !hint;
  $('#menuHint').textContent = hint ? `Plan del día: ${hint.replace(/\n/g, ' · ')}` : '';

  document.querySelectorAll('.grid').forEach(grid => {
    grid.innerHTML = '';
    SLOTS.filter(s => s.group === grid.dataset.group).forEach(slot => {
      const content = view.slots[slot.key] || '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile' + (content ? ' done' : '') + (view.pending[slot.key] ? ' pending' : '');
      btn.innerHTML = `<span class="tile-icon">${slot.icon}</span>
        <span class="tile-label"></span>
        <span class="tile-text"></span>`;
      btn.querySelector('.tile-label').textContent = slot.short || slot.label;
      btn.querySelector('.tile-text').textContent = content ? content.split('\n').join(' · ') : '';
      btn.addEventListener('click', () => openEntry(slot.key));
      grid.appendChild(btn);
    });
  });
  renderSync();
}

function renderSync() {
  const b = $('#syncBadge');
  const n = state.queue.length;
  let cls = 'ok', text = '✓';
  if (!state.settings.url) { cls = 'warn'; text = 'Configurar'; }
  else if (state.syncing) { cls = 'busy'; text = '↻'; }
  else if (n && !navigator.onLine) { cls = 'warn'; text = `${n} sin conexión`; }
  else if (n && state.lastError) { cls = 'err'; text = `${n} ⚠︎`; }
  else if (n) { cls = 'busy'; text = String(n); }
  else if (state.lastError) { cls = 'err'; text = '⚠︎'; }
  b.className = 'sync ' + cls;
  b.textContent = text;
  b.title = state.lastError || '';
  $('#pendingCount').textContent = n;
  $('#pendingList').innerHTML = '';
  state.queue.forEach(op => {
    const li = document.createElement('li');
    li.textContent = `${op.date} · ${SLOT[op.slot].short || SLOT[op.slot].label}: ${op.op === 'add' ? op.line : '(celda editada)'}`;
    $('#pendingList').appendChild(li);
  });
}

function setDate(iso) {
  state.date = iso;
  render();
  refreshDay(iso);
}

// ───────────────────────── Hoja de registro ─────────────────────────

const form = { slot: null, mode: 'fields', values: {}, lineDirty: false, harvard: {} };

function openEntry(key) {
  const slot = SLOT[key];
  form.slot = slot;
  form.values = {};
  form.lineDirty = false;
  form.harvard = {};
  form.mode = store.get('mode:' + key, 'fields');

  $('#sheetTitle').textContent = `${slot.icon} ${slot.label}`;
  $('#timeInput').value = nowTime();

  const view = viewDay(state.date);
  const current = view.slots[key] || '';
  $('#currentBox').hidden = !current;
  $('#currentText').textContent = current;

  const isActivity = !!ACTIVITY_FIELDS[slot.kind];
  $('#modeSeg').hidden = !isActivity;
  $('#fieldsBox').innerHTML = '';
  $('#foodBox').hidden = slot.kind !== 'food';
  $('#foodText').value = '';
  $('#lineText').value = '';
  $('#lineText').placeholder = slot.kind === 'note' ? 'Escribe el comentario' : '';

  if (isActivity) buildActivityFields(slot.kind);
  if (slot.kind === 'food') buildFoodBox(slot, view.menu);
  applyMode();
  updateLine();
  $('#entrySheet').showModal();
}

function applyMode() {
  const isActivity = !!ACTIVITY_FIELDS[form.slot.kind];
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === form.mode));
  $('#fieldsBox').hidden = !isActivity || form.mode !== 'fields';
  if (isActivity && form.mode === 'text') $('#lineText').focus();
}

function buildActivityFields(kind) {
  const box = $('#fieldsBox');
  const recentOther = store.get('other:' + kind, {});
  for (const f of ACTIVITY_FIELDS[kind]) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.textContent = f.label;
    wrap.appendChild(label);

    if (f.type === 'chips') {
      const chips = document.createElement('div');
      chips.className = 'chips';
      const options = [...f.options, ...(recentOther[f.id] || []).filter(o => !f.options.includes(o))];
      const other = document.createElement('input');
      other.type = 'text';
      other.placeholder = 'Otro…';
      other.className = 'other';
      options.forEach(opt => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'chip';
        c.textContent = opt;
        c.addEventListener('click', () => {
          const on = form.values[f.id] !== opt;
          chips.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
          if (on) c.classList.add('on');
          form.values[f.id] = on ? opt : '';
          other.value = '';
          updateLine();
        });
        chips.appendChild(c);
      });
      other.addEventListener('input', () => {
        chips.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
        form.values[f.id] = other.value.trim();
        form.values['_other_' + f.id] = other.value.trim();
        updateLine();
      });
      chips.appendChild(other);
      wrap.appendChild(chips);
    } else if (f.type === 'dur') {
      const row = document.createElement('div');
      row.className = 'dur';
      row.innerHTML = `<input type="number" inputmode="numeric" min="0" placeholder="h" aria-label="Horas"><span>h</span>
        <input type="number" inputmode="numeric" min="0" max="59" placeholder="min" aria-label="Minutos"><span>min</span>`;
      const [h, m] = row.querySelectorAll('input');
      const upd = () => { form.values[f.id] = { h: h.value, m: m.value }; updateLine(); };
      h.addEventListener('input', upd);
      m.addEventListener('input', upd);
      wrap.appendChild(row);
    } else {
      const input = document.createElement('input');
      input.type = f.type === 'num' ? 'number' : 'text';
      if (f.type === 'num') { input.inputMode = 'decimal'; input.step = f.step; input.min = '0'; }
      if (f.placeholder) input.placeholder = f.placeholder;
      input.addEventListener('input', () => { form.values[f.id] = input.value; updateLine(); });
      wrap.appendChild(input);
    }
    box.appendChild(wrap);
  }
}

/** Compone la línea del Sheet a partir de los campos, imitando tu forma de escribir. */
function composeActivity(kind, v) {
  const dur = v.dur || {};
  const parts = [];
  if (kind === 'gym') {
    parts.push(v.tipo, formatDur(dur.h, dur.m), v.notas);
  } else if (kind === 'ent') {
    parts.push(v.deporte, v.tipo, formatKm(v.km, 'Km'), formatDur(dur.h, dur.m),
      v.desnivel ? `${v.desnivel}m desnivel` : '', v.notas);
  } else if (kind === 'bas') {
    parts.push(v.act, v.lugar, formatKm(v.km, 'km'), formatDur(dur.h, dur.m, 'clock'));
  }
  return parts.map(p => (p || '').toString().trim()).filter(Boolean).join(' ');
}

// ── Comidas: sugerencias del histórico, lugar, bebida y suplementos ──

/** Igual que itemKey del script: minúsculas, sin acentos, sin "1 "/"un " delante. */
const keyOf = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').replace(/^(?:(?:y|e|con|1|un|una)\s+)+(?=\D)/, '').trim();
const capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const lowFirst = s => (s && /^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const listOf = s => String(s || '').split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
const ITEMS_SHOWN = 16;

/** Sugerencias de una categoría para la franja; si hay pocas, completa con las de todas. */
function suggestions(slotKey, cat, min = 6) {
  const h = state.history || {};
  const own = ((h[slotKey] || {})[cat] || []).map(r => r[0]);
  if (own.length >= min) return own;
  const seen = new Set(own.map(keyOf));
  return [...own, ...((h.ALL || {})[cat] || []).map(r => r[0]).filter(t => !seen.has(keyOf(t)))];
}

/** Añade o quita un elemento de una lista separada por comas (textarea o input). */
function toggleInList(el, label, { lower = false } = {}) {
  const items = listOf(el.value);
  const k = keyOf(label);
  const i = items.findIndex(x => keyOf(x) === k);
  if (i >= 0) items.splice(i, 1);
  else items.push(items.length || lower ? lowFirst(label) : label);
  el.value = items.join(', ');
  el.dispatchEvent(new Event('input'));
}

function makeChip(text, { on = false, cls = '', title = '', onClick, onHold } = {}) {
  const c = document.createElement('button');
  c.type = 'button';
  c.className = `chip ${cls}${on ? ' on' : ''}`;
  c.textContent = text;
  c.dataset.key = keyOf(text.replace(/^★\s*/, ''));
  if (title) c.title = title;
  c.addEventListener('click', onClick);
  if (onHold) c.addEventListener('contextmenu', e => { e.preventDefault(); onHold(); });
  return c;
}

function buildFoodBox(slot, menu) {
  const ideal = menu && menu[slot.key];
  $('#idealHint').hidden = !ideal;
  $('#idealHint').textContent = ideal ? `Menú ideal: ${ideal.replace(/\n/g, ' · ')}` : '';
  $('#foodText').value = '';
  $('#drinkText').value = '';
  $('#suppText').value = '';
  $('#placeOther').value = '';
  $('#searchInput').value = '';
  form.place = '';
  form.showAllItems = false;
  form.harvardTouched = {};

  // Lugar (una opción)
  const places = $('#placeChips');
  places.querySelectorAll('.chip').forEach(c => c.remove());
  const placeList = suggestions(slot.key, 'lugares', 3).slice(0, 4);
  ['En casa', 'En la oficina', 'En restaurante'].forEach(p => {
    if (!placeList.some(x => keyOf(x) === keyOf(p))) placeList.push(p);
  });
  placeList.slice(0, 5).reverse().forEach(p => {
    places.prepend(makeChip(p, {
      onClick: () => {
        form.place = keyOf(form.place) === keyOf(p) ? '' : p;
        $('#placeOther').value = '';
        refreshChips();
        updateLine();
      }
    }));
  });

  renderFoodSuggestions();
  renderListChips('#drinkChips', '#drinkText', suggestions(slot.key, 'bebidas').slice(0, 8), ['Agua'], true);
  renderListChips('#suppChips', '#suppText', suggestions(slot.key, 'suplementos', 3).slice(0, 6), []);

  $('#harvardOn').checked = !!slot.harvard;
  const items = $('#harvardItems');
  items.innerHTML = '';
  HARVARD.forEach(h => {
    items.appendChild(makeChip(h.label, {
      onClick: e => {
        form.harvard[h.key] = !form.harvard[h.key];
        form.harvardTouched[h.key] = true;
        e.currentTarget.classList.toggle('on', form.harvard[h.key]);
        updateLine();
      }
    }));
  });
  items.hidden = !slot.harvard;
}

/** Chips de bebida o suplementos: añaden/quitan del campo de texto. */
function renderListChips(boxSel, inputSel, list, always, lower = false) {
  const box = $(boxSel);
  box.innerHTML = '';
  const all = [...list];
  always.forEach(a => { if (!all.some(x => keyOf(x) === keyOf(a))) all.unshift(a); });
  all.forEach(t => box.appendChild(makeChip(t, { onClick: () => toggleInList($(inputSel), t, { lower }) })));
  box.hidden = !all.length;
}

/** Combinaciones (favoritos ★, recientes y del histórico) y elementos sueltos. */
function renderFoodSuggestions() {
  const slot = form.slot;
  const q = keyOf($('#searchInput').value);
  const favs = store.get('fav:' + slot.key, []);
  const combos = [];
  const seen = new Set();
  const addCombo = (t, fav) => { const k = keyOf(t); if (!t || seen.has(k)) return; seen.add(k); combos.push({ t, fav }); };
  favs.forEach(t => addCombo(t, true));
  store.get('recent:' + slot.key, []).slice(0, 4).forEach(t => addCombo(t));
  suggestions(slot.key, 'combos', 0).forEach(t => addCombo(t));

  let items;
  if (q) {
    // Busca en todo el histórico (todas las franjas), elementos y combinaciones.
    const h = state.history || {};
    const pool = [...suggestions(slot.key, 'items', 0), ...((h.ALL || {}).items || []).map(r => r[0])];
    const s = new Set();
    items = pool.filter(t => { const k = keyOf(t); if (s.has(k) || !k.includes(q)) return false; s.add(k); return true; }).slice(0, 30);
  } else {
    items = suggestions(slot.key, 'items');
  }

  const comboBox = $('#comboChips');
  comboBox.innerHTML = '';
  const shownCombos = combos.filter(c => !q || keyOf(c.t).includes(q)).slice(0, q ? 10 : 4);
  shownCombos.forEach(({ t, fav }) => comboBox.appendChild(makeChip((fav ? '★ ' : '') + t, {
    cls: 'combo' + (fav ? ' fav' : ''),
    title: fav ? 'Mantén pulsado para quitar de favoritos' : '',
    onClick: () => {
      // Una combinación sustituye a lo escrito si estaba vacío; si no, añade sus elementos.
      listOf(t).forEach(x => { if (!listOf($('#foodText').value).some(y => keyOf(y) === keyOf(x))) toggleInList($('#foodText'), x); });
    },
    onHold: fav ? () => {
      if (!confirm(`¿Quitar "${t}" de favoritos?`)) return;
      store.set('fav:' + slot.key, store.get('fav:' + slot.key, []).filter(x => x !== t));
      renderFoodSuggestions();
    } : null
  })));
  $('#combosBlock').hidden = !shownCombos.length;

  const itemBox = $('#itemChips');
  itemBox.innerHTML = '';
  const limit = q || form.showAllItems ? items.length : ITEMS_SHOWN;
  items.slice(0, limit).forEach(t => itemBox.appendChild(makeChip(t, { onClick: () => toggleInList($('#foodText'), t) })));
  if (!q && items.length > ITEMS_SHOWN) {
    const more = makeChip(form.showAllItems ? 'Menos' : `Más (${items.length - ITEMS_SHOWN})`, {
      cls: 'more',
      onClick: () => { form.showAllItems = !form.showAllItems; renderFoodSuggestions(); }
    });
    itemBox.appendChild(more);
  }
  if (q && !items.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Nada en el histórico. Escríbelo abajo.';
    itemBox.appendChild(p);
  }
  if (!state.history && !q) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Cargando sugerencias del histórico…';
    itemBox.appendChild(p);
  }
  refreshChips();
}

/** Marca como activos los chips que ya están en el texto. */
function refreshChips() {
  const mark = (boxSel, value) => {
    const keys = new Set(listOf(value).map(keyOf));
    document.querySelectorAll(`${boxSel} .chip`).forEach(c => c.classList.toggle('on', keys.has(c.dataset.key)));
  };
  mark('#itemChips', $('#foodText').value);
  mark('#drinkChips', $('#drinkText').value);
  mark('#suppChips', $('#suppText').value);
  document.querySelectorAll('#placeChips .chip').forEach(c => c.classList.toggle('on', !!form.place && c.dataset.key === keyOf(form.place)));
  document.querySelectorAll('#comboChips .chip').forEach(c => {
    const food = new Set(listOf($('#foodText').value).map(keyOf));
    const parts = listOf(c.textContent.replace(/^★\s*/, '')).map(keyOf);
    c.classList.toggle('on', parts.length > 0 && parts.every(p => food.has(p)));
  });
}

/** "15:00 en casa. Paella con verduras, pan integral. Bebida: agua. Suplementos: Natalbel" */
function composeFood() {
  const strip = s => s.trim().replace(/[.,;\s]+$/, '');
  const parts = [];
  if (form.place) parts.push(lowFirst(strip(form.place)));
  const food = strip(clean($('#foodText').value));
  if (food) parts.push(capFirst(food));
  const drinks = strip($('#drinkText').value);
  if (drinks) parts.push(`Bebida: ${drinks}`);
  const supps = strip($('#suppText').value);
  if (supps) parts.push(`Suplementos: ${supps}`);
  if (!food && !drinks && !supps) return '';
  return parts.join('. ');
}

function harvardNote() {
  if (form.slot.kind !== 'food' || !$('#harvardOn').checked) return '';
  const label = form.slot.short || form.slot.label;
  return `${label} Harvard: ` + HARVARD.map(h => `${h.key} ${form.harvard[h.key] ? '✓' : '✗'}`).join(' · ');
}

function updateLine() {
  const slot = form.slot;
  if (!form.lineDirty) {
    let body = '';
    if (slot.kind === 'food') body = composeFood();
    else if (ACTIVITY_FIELDS[slot.kind] && form.mode === 'fields') body = composeActivity(slot.kind, form.values);
    if (slot.kind !== 'note' && !(ACTIVITY_FIELDS[slot.kind] && form.mode === 'text')) {
      $('#lineText').value = body ? `${sheetTime($('#timeInput').value)} ${body}` : '';
    }
  }
  const note = harvardNote();
  $('#harvardPreview').hidden = !note;
  $('#harvardPreview').textContent = note ? `+ en COMENTARIOS: ${note}` : '';
  const favs = store.get('fav:' + slot.key, []);
  const favText = slot.kind === 'food' ? clean($('#foodText').value) : '';
  $('#favBtn').hidden = slot.kind !== 'food';
  $('#favBtn').textContent = favText && favs.includes(favText) ? '★ Favorito' : '☆ Favorito';
  if (slot.kind === 'food') refreshChips();
}

function rememberRecent(slotKey, text) {
  if (!text) return;
  const list = store.get('recent:' + slotKey, []).filter(t => t !== text);
  list.unshift(text);
  store.set('recent:' + slotKey, list.slice(0, 20));
}

function rememberOtherOptions(kind) {
  const fields = ACTIVITY_FIELDS[kind];
  if (!fields) return;
  const saved = store.get('other:' + kind, {});
  for (const f of fields) {
    const v = form.values['_other_' + f.id];
    if (f.type === 'chips' && v && !f.options.includes(v)) {
      saved[f.id] = [v, ...(saved[f.id] || []).filter(x => x !== v)].slice(0, 4);
    }
  }
  store.set('other:' + kind, saved);
}

function saveEntry(e) {
  e.preventDefault();
  const slot = form.slot;
  let line = $('#lineText').value.replace(/\s*\n+\s*/g, ' ').trim();
  if (!line) { toast('Escribe algo primero'); return; }
  // Si la línea no empieza por hora, la añadimos (los comentarios van sin hora).
  if (slot.kind !== 'note' && !/^\d{1,2}[:.]\d{2}/.test(line) && $('#timeInput').value) {
    line = `${sheetTime($('#timeInput').value)} ${line}`;
  }
  enqueue({ op: 'add', date: state.date, slot: slot.key, line });
  const note = harvardNote();
  if (note) enqueue({ op: 'add', date: state.date, slot: 'COMENT', line: note });
  if (slot.kind === 'food') rememberRecent(slot.key, clean($('#foodText').value));
  rememberOtherOptions(slot.kind);
  if (ACTIVITY_FIELDS[slot.kind]) store.set('mode:' + slot.key, form.mode);
  $('#entrySheet').close();
  toast(navigator.onLine ? 'Guardado ✓' : 'Guardado en el móvil. Se enviará al volver la conexión');
}

// ───────────────────────── Editar celda ─────────────────────────

function openEditCell() {
  const slot = form.slot;
  $('#entrySheet').close();
  $('#editTitle').textContent = `Editar ${slot.label}`;
  $('#editText').value = viewDay(state.date).slots[slot.key] || '';
  $('#editSheet').showModal();
}

function saveEditCell(e) {
  e.preventDefault();
  const value = $('#editText').value.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  enqueue({ op: 'set', date: state.date, slot: form.slot.key, value });
  $('#editSheet').close();
  toast('Celda actualizada');
}

// ───────────────────────── Ajustes ─────────────────────────

function openSettings() {
  $('#urlInput').value = state.settings.url;
  $('#tokenInput').value = state.settings.token;
  $('#settingsStatus').textContent = state.lastError ? `Último error: ${state.lastError}` : '';
  $('#appVersion').textContent = `Versión de la app: ${APP_VERSION}`;
  renderSync();
  $('#settingsSheet').showModal();
}

function readSettingsForm() {
  return { url: $('#urlInput').value.trim(), token: $('#tokenInput').value.trim() };
}

async function testConnection() {
  const prev = state.settings;
  state.settings = readSettingsForm();
  $('#settingsStatus').textContent = 'Probando…';
  try {
    const { sheets } = await api({ action: 'ping' });
    $('#settingsStatus').textContent = `Conectado ✓ Temporadas: ${sheets.map(s => `${s.name} (desde ${s.start})`).join(', ')}`;
  } catch (err) {
    $('#settingsStatus').textContent = `Error: ${err.message}`;
  } finally {
    state.settings = prev;
  }
}

function saveSettings(e) {
  e.preventDefault();
  state.settings = readSettingsForm();
  store.set('settings', state.settings);
  state.lastError = '';
  $('#settingsSheet').close();
  refreshDay(state.date);
  loadHistory(true);
  flush();
}

// ───────────────────────── Arranque ─────────────────────────

function init() {
  $('#prevDay').addEventListener('click', () => setDate(addDays(state.date, -1)));
  $('#nextDay').addEventListener('click', () => setDate(addDays(state.date, 1)));
  $('#goToday').addEventListener('click', () => setDate(isoDate(new Date())));
  $('#dateInput').addEventListener('change', e => e.target.value && setDate(e.target.value));
  $('#dateLabel').addEventListener('click', () => {
    const input = $('#dateInput');
    if (input.showPicker) { try { input.showPicker(); return; } catch { /* iOS */ } }
    input.focus();
  });
  $('#syncBadge').addEventListener('click', () => (state.queue.length && navigator.onLine ? flush() : openSettings()));
  $('#openSettings').addEventListener('click', openSettings);

  document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => {
    form.mode = b.dataset.mode;
    form.lineDirty = false;
    applyMode();
    updateLine();
  }));
  $('#timeInput').addEventListener('input', () => {
    // Cambiar la hora reescribe la hora al principio de la línea, aunque la hayas editado.
    const t = sheetTime($('#timeInput').value);
    const line = $('#lineText').value;
    if (form.lineDirty && /^\d{1,2}[:.]\d{2}\s/.test(line)) $('#lineText').value = line.replace(/^\d{1,2}[:.]\d{2}/, t);
    else updateLine();
  });
  $('#foodText').addEventListener('input', () => { form.lineDirty = false; updateLine(); });
  $('#lineText').addEventListener('input', () => { form.lineDirty = true; updateLine(); });
  $('#searchInput').addEventListener('input', renderFoodSuggestions);
  $('#suppText').addEventListener('input', () => { form.lineDirty = false; updateLine(); });
  $('#drinkText').addEventListener('input', () => {
    // Si bebes agua, se marca sola en el plato Harvard (salvo que lo hayas tocado tú).
    const agua = /\bagua\b/i.test($('#drinkText').value);
    if (!form.harvardTouched.agua) {
      form.harvard.agua = agua;
      const chip = [...$('#harvardItems').children].find(c => c.textContent.startsWith('Agua'));
      if (chip) chip.classList.toggle('on', agua);
    }
    form.lineDirty = false;
    updateLine();
  });
  $('#placeOther').addEventListener('input', () => {
    form.place = $('#placeOther').value.trim();
    form.lineDirty = false;
    updateLine();
  });
  $('#harvardOn').addEventListener('change', () => { $('#harvardItems').hidden = !$('#harvardOn').checked; updateLine(); });
  $('#favBtn').addEventListener('click', () => {
    const key = form.slot.key;
    const text = clean($('#foodText').value);
    if (!text) { toast('Escribe la comida primero'); return; }
    const favs = store.get('fav:' + key, []);
    store.set('fav:' + key, favs.includes(text) ? favs.filter(f => f !== text) : [text, ...favs].slice(0, 12));
    toast(favs.includes(text) ? 'Quitado de favoritos' : 'Añadido a favoritos ★');
    renderFoodSuggestions();
    updateLine();
  });
  $('#entryForm').addEventListener('submit', saveEntry);
  $('#editCellBtn').addEventListener('click', openEditCell);
  $('#editForm').addEventListener('submit', saveEditCell);
  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#testBtn').addEventListener('click', testConnection);
  $('#clearQueueBtn').addEventListener('click', () => {
    if (!confirm('¿Descartar todo lo pendiente de enviar? No se podrá recuperar.')) return;
    state.queue = [];
    store.set('queue', state.queue);
    render();
  });

  window.addEventListener('online', () => { flush(); refreshDay(state.date); });
  window.addEventListener('offline', renderSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Al volver a la app otro día, salta a hoy.
    const last = store.get('lastOpen', state.date);
    const today = isoDate(new Date());
    if (last !== today && state.date === last) state.date = today;
    store.set('lastOpen', today);
    render();
    flush();
    refreshDay(state.date);
  });

  store.set('lastOpen', state.date);
  render();
  if (!state.settings.url) openSettings();
  refreshDay(state.date);
  loadHistory();
  flush();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
