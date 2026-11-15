'use strict';

// Cambia junto con ?v= en index.html y VERSION en sw.js.
const APP_VERSION = 8;

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
  { key: 'verdura', label: 'Verdura/fruta' },
  { key: 'proteína', label: 'Proteína' },
  { key: 'integral', label: 'Cereal integral' },
  { key: 'aceite', label: 'Aceite de oliva' },
  { key: 'agua', label: 'Agua / sin azúcar' }
];

// Valoración automática del plato Harvard a partir de lo escrito (sin acentos, minúsculas).
const HARVARD_PROTEIN = ['PESCADO', 'LEGUMBRE', 'CARNE', 'HUEVO', 'FS'];
const WHOLE_RE = /\b(integral(es)?|avena|quinoa|centeno|espelta|trigo sarraceno|mijo|bulgur|salvado)\b/;
const OIL_RE = /\b(aceite|aove|oliva|alinad[ao]s?|alino)\b/;
const SUGARY_RE = /\b(coca ?-?cola|fanta|refresco|zumo|batido|nestea|aquarius|tonica|red ?bull|monster|vino|cerveza|vermut|cava|sidra|copa|cubata|gin|ron|whisky|colacao|cola cao)\b/;
const SUGAR_FREE_RE = /\b(zero|light|sin azucar|sin alcohol|0[.,]0|0)\b/;

/** Qué cumple lo escrito: { verdura: true, …, tips: [...] }. Las cantidades no se pueden comprobar. */
function harvardAuto(foodText, drinksText) {
  const food = keyOf(foodText);
  const groups = classifyMeal(clean(foodText), state.overrides).groups;
  const drinks = listOf(drinksText).map(keyOf);
  const sugary = drinks.filter(d => SUGARY_RE.test(d) && !SUGAR_FREE_RE.test(d));
  const r = {
    verdura: groups.includes('VERDURA') || groups.includes('FRUTA'),
    'proteína': HARVARD_PROTEIN.some(g => groups.includes(g)),
    integral: groups.includes('CHO') && WHOLE_RE.test(food),
    aceite: OIL_RE.test(food),
    agua: drinks.length > 0 && !sugary.length
  };
  r.tips = {
    verdura: 'añade verdura o fruta (la mitad del plato)',
    'proteína': 'añade proteína: pescado, pollo, huevo, legumbre o frutos secos',
    integral: groups.includes('CHO') ? 'el cereal no es integral (pan, pasta o arroz integral)' : 'añade cereal integral (un cuarto del plato)',
    aceite: '¿llevaba aceite de oliva? Si es así, tócalo',
    agua: drinks.length ? `mejor agua, infusión o café que ${sugary.join(', ')}` : 'pon la bebida (agua, infusión…)'
  };
  return r;
}

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
  overrides: store.get('overrides', {}),  // correcciones de grupos del menú ideal
  config: store.get('config', null),      // listas de botones y diccionario (guardado en el script)
  configLoaded: !!store.get('config', null),
  scriptVersion: null,
  strava: store.get('strava', { status: null, pending: [], at: 0 }),
  view: store.get('view', 'register'),
  weekStart: null,
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
    if (state.view === 'eat') renderEat();
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
      } else if (op.op === 'stravaMark') {
        await api({ action: 'stravaMark', id: op.stravaId, status: op.status });
      } else if (op.op === 'config') {
        await api({ action: 'setConfig', name: op.name, value: op.value });
      } else if (op.op === 'groups') {
        await api({ action: 'setGroups', key: op.key, groups: op.groups });
      } else {
        await api({ action: 'set', date: op.date, slot: op.slot, value: op.value });
      }
      if (op.date) touched.add(op.date);
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
  if (state.view === 'plan') renderPlan(); else render();
  if (state.view === 'config') renderConfig();
}

// ───────────────────────── Pantalla principal ─────────────────────────

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function render() {
  if (state.view === 'plan') { renderPlan(); renderSync(); return; }
  if (state.view === 'config') { renderSync(); return; }
  if (state.view === 'eat') { renderEat(); renderSync(); return; }
  const d = parseIso(state.date);
  const isToday = state.date === isoDate(new Date());
  $('#dateText').textContent = `${isToday ? 'Hoy, ' : ''}${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  $('#dateInput').value = state.date;
  $('#goToday').hidden = isToday;

  const view = viewDay(state.date);
  const hint = view.menu && view.menu.training;
  $('#menuHint').hidden = !hint;
  $('#menuHint').textContent = hint ? `Plan del día: ${hint.replace(/\n/g, ' · ')}` : '';
  renderTodayPlan();
  renderStravaCard();

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
    li.textContent = op.op === 'groups' ? `Corrección: ${op.key}` : op.op === 'config' ? `Ajuste: ${op.name}` : op.op === 'stravaMark' ? `Strava: actividad ${op.status === 'added' ? 'añadida' : 'descartada'}`
      : `${op.date} · ${SLOT[op.slot].short || SLOT[op.slot].label}: ${op.op === 'add' ? op.line : '(celda editada)'}`;
    $('#pendingList').appendChild(li);
  });
}

function setDate(iso) {
  state.date = iso;
  render();
  refreshDay(iso);
  loadWeek(mondayOf(iso));
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
  $('#timeInput').hidden = slot.kind === 'note';

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
  form.planGroup = null;
  form.stravaId = null;
  if (slot.kind === 'food') { buildFoodBox(slot, view.menu); renderPlanBlock(); renderDetected(); }
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
  form.idealText = ideal ? `Menú ideal: ${ideal.replace(/\n/g, ' · ')}` : '';
  $('#idealHint').hidden = !ideal;
  $('#idealHint').textContent = form.idealText;
  $('#foodText').value = '';
  $('#drinkText').value = '';
  $('#suppText').value = '';
  $('#drinkOther').value = '';
  $('#suppOther').value = '';
  $('#placeOther').value = '';
  $('#searchInput').value = '';
  form.place = '';
  form.showAllItems = false;
  form.harvardTouched = {};
  form.foodTab = 'hab';

  // Lugar (una opción), en una fila que se desliza
  const places = $('#placeChips');
  places.querySelectorAll('.chip').forEach(c => c.remove());
  const placeList = presetItems('LUGARES');
  placeList.forEach(p => {
    places.insertBefore(makeChip(p, {
      onClick: () => {
        form.place = keyOf(form.place) === keyOf(p) ? '' : p;
        $('#placeOther').value = '';
        refreshChips();
        updateLine();
      }
    }), $('#placeOther'));
  });

  renderFoodSuggestions();
  renderListChips('#drinkChips', '#drinkText', presetItems('BEBIDAS'), true);
  renderListChips('#suppChips', '#suppText', presetItems('SUPLEMENTOS'));
  setFoodTab('hab');

  $('#harvardOn').checked = !!slot.harvard;
  const items = $('#harvardItems');
  items.innerHTML = '';
  HARVARD.forEach(h => {
    items.appendChild(makeChip(h.label, {
      onClick: e => {
        // Tocar corrige la valoración automática de ese punto.
        form.harvard[h.key] = !form.harvard[h.key];
        form.harvardTouched[h.key] = true;
        updateLine();
      }
    }));
    items.lastChild.dataset.h = h.key;
  });
}

/** Chips de bebida o suplementos en una fila: añaden/quitan del campo oculto. */
function renderListChips(boxSel, inputSel, list, lower = false) {
  const box = $(boxSel);
  box.querySelectorAll('.chip').forEach(c => c.remove());
  box.dataset.input = inputSel;
  box.dataset.lower = lower ? '1' : '';
  list.forEach(t => addListChip(box, t));
}

function addListChip(box, t) {
  const other = box.querySelector('.other');
  box.insertBefore(makeChip(t, { onClick: () => toggleInList($(box.dataset.input), t, { lower: !!box.dataset.lower }) }), other);
}

/** "Otra…": lo que escribes se convierte en un chip marcado. */
function addOtherToList(otherEl) {
  const box = otherEl.closest('.chips');
  const input = $(box.dataset.input);
  listOf(otherEl.value).forEach(t => {
    if (!listOf(input.value).some(x => keyOf(x) === keyOf(t))) toggleInList(input, t, { lower: !!box.dataset.lower });
  });
  otherEl.value = '';
}

/** Pestañas de sugerencias: Habituales, Menú ideal y Buscar. */
function setFoodTab(tab) {
  form.foodTab = tab;
  document.querySelectorAll('#foodTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#habPanel').hidden = tab === 'plan';
  $('#planBlock').hidden = tab !== 'plan';
  const search = $('#searchInput');
  search.hidden = tab !== 'search';
  if (tab !== 'search' && search.value) { search.value = ''; renderFoodSuggestions(); }
  if (tab === 'search') search.focus();
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
    items = presetItems(slot.key);
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
  ['#drinkChips', '#suppChips'].forEach(sel => {
    const box = $(sel);
    const have = new Set([...box.querySelectorAll('.chip')].map(c => c.dataset.key));
    listOf($(box.dataset.input || '#none')?.value).forEach(t => { if (!have.has(keyOf(t))) addListChip(box, t); });
  });
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

function applyHarvardAuto() {
  form.harvardAuto = harvardAuto($('#foodText').value, $('#drinkText').value);
  HARVARD.forEach(h => { if (!form.harvardTouched[h.key]) form.harvard[h.key] = form.harvardAuto[h.key]; });
}

/** "Cumple 3 de 5" con cada punto ✓/✗ y qué cambiar para cumplirlo. */
function renderHarvard() {
  const empty = !clean($('#foodText').value);
  const ok = HARVARD.filter(h => form.harvard[h.key]).length;
  const sum = $('#harvardSum');
  sum.textContent = empty ? '' : ok === HARVARD.length ? 'Cumple ✓' : `Cumple ${ok} de ${HARVARD.length}`;
  sum.className = 'harvard-score' + (empty ? '' : ok === HARVARD.length ? ' good' : ok >= 3 ? ' mid' : ' bad');
  [...$('#harvardItems').children].forEach(c => {
    const h = HARVARD.find(x => x.key === c.dataset.h);
    const yes = !!form.harvard[h.key];
    c.textContent = empty ? h.label : `${yes ? '✓' : '✗'} ${h.label}${form.harvardTouched[h.key] ? ' ✎' : ''}`;
    c.classList.toggle('on', !empty && yes);
    c.classList.toggle('no', !empty && !yes);
  });
  const tips = HARVARD.filter(h => !form.harvard[h.key]).map(h => form.harvardAuto.tips[h.key]);
  $('#harvardTips').textContent = empty
    ? 'Se valora solo con lo que pongas en la comida y la bebida.'
    : tips.length ? `Para cumplirlo: ${tips.join(' · ')}.` : 'Las cantidades no se comprueban: verdura la mitad, proteína y cereal un cuarto cada uno.';
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
  const lt = $('#lineText');
  lt.style.height = 'auto';
  lt.style.height = Math.min(lt.scrollHeight + 2, 96) + 'px';
  if (slot.kind === 'food') applyHarvardAuto();
  const note = harvardNote();
  $('#harvardPreview').hidden = !note;
  $('#harvardPreview').textContent = note ? `+ en COMENTARIOS: ${note}` : '';
  if (slot.kind === 'food') renderHarvard();
  const favs = store.get('fav:' + slot.key, []);
  const favText = slot.kind === 'food' ? clean($('#foodText').value) : '';
  $('#favBtn').hidden = slot.kind !== 'food';
  $('#favBtn').textContent = favText && favs.includes(favText) ? '★ Favorito' : '☆ Favorito';
  if (slot.kind === 'food') { refreshChips(); renderPlanBlock(); renderDetected(); }
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
  if (form.stravaId) {
    // Después de la línea en la cola: si no llega a escribirse, la actividad no se da por añadida.
    state.strava.pending = (state.strava.pending || []).filter(x => x.id !== form.stravaId);
    store.set('strava', state.strava);
    state.queue.push({ id: uid(), at: Date.now(), op: 'stravaMark', stravaId: form.stravaId, status: 'added' });
    store.set('queue', state.queue);
    form.stravaId = null;
    render();
  }
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
  switchView('config');
  $('#cfgConnection').open = true;
}

function readSettingsForm() {
  return { url: $('#urlInput').value.trim(), token: $('#tokenInput').value.trim() };
}

async function testConnection() {
  const prev = state.settings;
  state.settings = readSettingsForm();
  $('#settingsStatus').textContent = 'Probando…';
  try {
    const { sheets, version } = await api({ action: 'ping' });
    $('#settingsStatus').textContent = `Conectado ✓ Temporadas: ${sheets.map(s => `${s.name} (desde ${s.start})`).join(', ')}`;
    if (version) { state.scriptVersion = version; $('#scriptVersion').textContent = `Script de Google: versión ${version}`; }
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
  toast('Guardado ✓');
  refreshDay(state.date);
  loadConfig();
  syncStrava(true);
  loadHistory(true);
  loadWeek(mondayOf(state.date), true);
  flush();
}

// ───────────────────────── Menú ideal ─────────────────────────

const WEEK_MAX_AGE = 10 * 60 * 1000;
const groupLabel = g => `${GROUP[g].icon} ${GROUP[g].label}`;
const todayIso = () => isoDate(new Date());

/** Descarga 7 días + esquema + correcciones y los deja en caché. */
async function loadWeek(start, force) {
  if (!state.settings.url || !navigator.onLine) return;
  const at = store.get('weekAt:' + start, 0);
  if (!force && Date.now() - at < WEEK_MAX_AGE) return;
  try {
    const { week } = await api({ action: 'week', start });
    week.days.forEach(d => {
      if (d.error) return;
      const prev = dayCache(d.date) || {};
      saveDayCache(d.date, { ...prev, date: d.date, slots: d.slots });
    });
    if (week.scheme) store.set('scheme', week.scheme);
    state.overrides = week.overrides || {};
    store.set('overrides', state.overrides);
    store.set('weekAt:' + start, Date.now());
    if (state.view === 'plan') renderPlan();
    else render();
    if ($('#entrySheet').open && form.slot && form.slot.kind === 'food') { renderPlanBlock(); updateLine(); }
  } catch (err) {
    state.lastError = err.message;
    renderSync();
  }
}

function currentScheme() {
  const raw = store.get('scheme', null);
  return raw ? parseScheme(raw) : null;
}

/** Cumplimiento de la semana que empieza en `start`, con lo pendiente de enviar incluido. */
function computeWeek(start) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    days.push({ date, slots: viewDay(date).slots });
  }
  return evaluateWeek(currentScheme(), days, state.overrides, todayIso());
}

// ── Pantalla "Menú ideal" ──

function weekLabel(start) {
  const a = parseIso(start);
  const b = parseIso(addDays(start, 6));
  return a.getMonth() === b.getMonth()
    ? `Semana ${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `Semana ${a.getDate()} ${MONTHS[a.getMonth()]}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

function renderPlan() {
  const start = state.weekStart;
  const isThisWeek = start === mondayOf(todayIso());
  $('#dateText').textContent = weekLabel(start) + (isThisWeek ? ' ·' : '');
  $('#goToday').hidden = true;

  const scheme = currentScheme();
  $('#planStatus').textContent = scheme ? '' : (state.settings.url ? 'Cargando el esquema del Sheet…' : 'Configura la conexión en Ajustes.');
  if (!scheme) { $('#weekBars').innerHTML = ''; $('#dayCards').innerHTML = ''; $('#pendingCard').hidden = true; return; }
  const week = computeWeek(start);

  // Pendiente de días anteriores
  const pend = Object.entries(week.pending);
  $('#pendingCard').hidden = !pend.length || !isThisWeek;
  $('#pendingChips').innerHTML = '';
  pend.forEach(([g, n]) => $('#pendingChips').appendChild(makeChip(`${groupLabel(g)} ×${n}`, { cls: 'warn-chip', onClick: () => {} })));

  // Barras por grupo: hecho (hasta hoy) sobre objetivo de la semana
  const bars = $('#weekBars');
  bars.innerHTML = '';
  GROUPS.forEach(({ key }) => {
    const target = week.target[key] || 0;
    const actual = week.actual[key] || 0;
    if (!target && !actual) return;
    const toDate = week.targetToDate[key] || 0;
    const ok = actual >= target;
    const behind = (week.actualToDate[key] || 0) < toDate;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<span class="bar-label"></span>
      <span class="bar"><span class="bar-fill"></span><span class="bar-mark"></span></span>
      <span class="bar-num"></span>`;
    row.querySelector('.bar-label').textContent = groupLabel(key);
    const pct = target ? Math.min(100, (actual / target) * 100) : 100;
    const fill = row.querySelector('.bar-fill');
    fill.style.width = pct + '%';
    fill.className = 'bar-fill ' + (ok ? 'ok' : behind ? 'behind' : 'on-track');
    // Marca: lo que debería llevar hasta hoy
    const expectedNow = toDate + ((week.days.find(d => d.status === 'today') || { target: {} }).target[key] || 0);
    const mark = row.querySelector('.bar-mark');
    if (target && expectedNow && expectedNow < target) mark.style.left = (expectedNow / target) * 100 + '%';
    else mark.hidden = true;
    row.querySelector('.bar-num').textContent = `${actual}/${target}${ok ? ' ✓' : ''}`;
    bars.appendChild(row);
  });

  // Tarjetas por día
  const cards = $('#dayCards');
  cards.innerHTML = '';
  week.days.forEach(day => cards.appendChild(dayCard(day)));
}

function dayCard(day) {
  const d = parseIso(day.date);
  const card = document.createElement('details');
  card.className = `card day-card ${day.status}`;
  if (day.status === 'today') card.open = true;
  const groups = GROUPS.map(g => g.key).filter(g => day.target[g]);
  const met = groups.filter(g => (day.actual[g] || 0) >= day.target[g]).length;
  const summary = document.createElement('summary');
  const title = `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
  const score = day.status === 'future' ? '' : `${met}/${groups.length}`;
  summary.innerHTML = `<span class="day-title"></span><span class="day-train"></span><span class="day-score"></span>`;
  summary.querySelector('.day-title').textContent = title + (day.status === 'today' ? ' · hoy' : '');
  summary.querySelector('.day-train').textContent = (day.trained ? '🏃 ' : '') + (day.schemeTraining || '').split('\n')[0];
  summary.querySelector('.day-score').textContent = score;
  summary.querySelector('.day-score').className = 'day-score ' + (day.status === 'future' ? '' : met === groups.length ? 'ok' : 'miss');
  card.appendChild(summary);

  const chips = document.createElement('div');
  chips.className = 'chips day-chips';
  groups.forEach(g => {
    const a = day.actual[g] || 0;
    const t = day.target[g];
    const cls = day.status === 'future' ? 'future' : a >= t ? 'ok' : 'miss';
    const c = document.createElement('span');
    c.className = 'gchip ' + cls;
    c.textContent = `${GROUP[g].icon} ${a}/${t}`;
    c.title = GROUP[g].label;
    chips.appendChild(c);
  });
  card.appendChild(chips);

  // Detalle por comida: qué tocaba y qué hubo
  const detail = document.createElement('div');
  detail.className = 'day-detail';
  FOOD_SLOT_KEYS.forEach(slot => {
    const exp = day.expectedSlots[slot];
    const meal = day.meals[slot];
    if (!exp && !meal) return;
    const row = document.createElement('div');
    row.className = 'meal-row';
    const head = document.createElement('div');
    head.className = 'meal-head';
    head.textContent = SLOT[slot].label + (exp && exp.training ? ' 🏃' : '');
    row.appendChild(head);
    if (exp) {
      const want = document.createElement('div');
      want.className = 'chips';
      exp.groups.forEach(({ g, note }) => {
        const has = meal && meal.groups.includes(g);
        const c = document.createElement('span');
        c.className = 'gchip ' + (day.status === 'future' ? 'future' : has ? 'ok' : 'miss');
        c.textContent = groupLabel(g) + (note ? ` (${note})` : '');
        want.appendChild(c);
      });
      if (exp.libre) { const c = document.createElement('span'); c.className = 'gchip future'; c.textContent = '✨ a elegir'; want.appendChild(c); }
      if (exp.during) { const c = document.createElement('span'); c.className = 'gchip ' + (meal ? 'ok' : day.status === 'future' ? 'future' : 'miss'); c.textContent = '💧 algo durante el entreno'; want.appendChild(c); }
      row.appendChild(want);
    }
    if (meal) {
      const ate = document.createElement('p');
      ate.className = 'meal-text';
      ate.textContent = viewDay(day.date).slots[slot].split('\n').join(' · ');
      row.appendChild(ate);
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'link small';
      fix.textContent = `Detectado: ${meal.groups.map(g => GROUP[g].icon).join(' ') || 'nada'} · Corregir`;
      fix.addEventListener('click', () => openGroupsEditor(viewDay(day.date).slots[slot], () => renderPlan()));
      row.appendChild(fix);
    }
    detail.appendChild(row);
  });
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'ghost small-btn';
  go.textContent = 'Registrar este día';
  go.addEventListener('click', () => { switchView('register'); setDate(day.date); });
  detail.appendChild(go);
  card.appendChild(detail);
  return card;
}

function switchView(view) {
  state.view = view;
  store.set('view', view);
  $('#main').hidden = view !== 'register';
  $('#planView').hidden = view !== 'plan';
  $('#configView').hidden = view !== 'config';
  $('#eatView').hidden = view !== 'eat';
  document.body.dataset.view = view;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  window.scrollTo(0, 0);
  if (view === 'plan') {
    if (!state.weekStart) state.weekStart = mondayOf(state.date);
    renderPlan();
    loadWeek(state.weekStart);
  } else if (view === 'eat') {
    renderEat();
    loadWeek(mondayOf(state.date));
  } else if (view === 'config') {
    renderConfig();
    loadConfig();
    syncStrava(true);
  } else {
    render();
  }
}

// ── En el registro: qué toca según el menú ideal ──

/** Lo que falta hoy para esta franja (esquema + pendiente de la semana) y lo que ya cubre el texto. */
function renderPlanBlock() {
  const slot = form.slot;
  const gbox = $('#planGroupChips');
  form.wantedGroups = [];
  const showPlan = on => {
    gbox.hidden = !on;
    $('#planTabBtn').hidden = !on;
    $('#idealHint').hidden = on || !form.idealText;
    if (!on && form.foodTab === 'plan') setFoodTab('hab');
  };
  if (!slot || slot.kind !== 'food' || !currentScheme()) { showPlan(false); return; }
  const week = computeWeek(mondayOf(state.date));
  // Se calcula sin lo que estás escribiendo, y luego se marca lo que ya cubre.
  const wanted = suggestGroups(week, state.date, slot.key);
  form.wantedGroups = wanted.map(w => w.g);
  showPlan(!!wanted.length);
  if (!wanted.length) return;
  const typed = new Set(classifyMeal(clean($('#foodText').value), state.overrides).groups);
  gbox.innerHTML = '';
  wanted.forEach(w => {
    const label = groupLabel(w.g) + (w.note ? ` (${w.note})` : '') + (w.reason === 'pending' ? ` ×${w.count}` : '');
    const chip = makeChip(label, {
      cls: 'gsel' + (w.reason === 'pending' ? ' warn-chip' : '') + (form.planGroup === w.g ? ' sel' : ''),
      onClick: () => { form.planGroup = form.planGroup === w.g ? null : w.g; setFoodTab('plan'); renderPlanBlock(); }
    });
    chip.classList.add('small');
    chip.classList.toggle('on', typed.has(w.g));
    gbox.appendChild(chip);
  });

  // Ideas del histórico para los grupos que faltan (o el elegido)
  const need = form.planGroup ? [form.planGroup] : wanted.map(w => w.g).filter(g => !typed.has(g));
  const ideas = $('#planIdeaChips');
  ideas.innerHTML = '';
  const missingCount = wanted.filter(w => !typed.has(w.g)).length;
  $('#planTabBtn').textContent = missingCount ? `📋 Falta ${missingCount}` : '📋 Cumple ✓';
  $('#planHint').textContent = need.length
    ? `Ideas de tu histórico para: ${need.map(groupLabel).join(', ')}.` + (wanted.some(w => w.reason === 'pending') ? ' En naranja, lo pendiente de otros días de la semana (×veces).' : '')
    : 'Ya cubres lo que pide el menú ideal en esta comida.';
  if (!need.length) return;
  const h = state.history || {};
  const pool = [...((h[slot.key] || {}).items || []), ...((h.ALL || {}).items || [])].map(r => r[0]);
  const seen = new Set();
  const typedKeys = new Set(listOf($('#foodText').value).map(keyOf));
  // Puntuación: lo pendiente de la semana vale el triple; cubrir varios grupos a la vez suma.
  const weight = g => (wanted.find(w => w.g === g && w.reason === 'pending') ? 3 : 1);
  const scored = [];
  pool.forEach((t, rank) => {
    const k = keyOf(t);
    if (seen.has(k) || typedKeys.has(k)) return;
    seen.add(k);
    const g = classifyMeal(t, state.overrides).groups;
    const score = need.filter(n => g.includes(n)).reduce((a, n) => a + weight(n), 0);
    if (score) scored.push({ t, score, rank });
  });
  scored.sort((a, b) => b.score - a.score || a.rank - b.rank);
  scored.slice(0, form.planGroup ? 12 : 8)
    .forEach(({ t }) => ideas.appendChild(makeChip(t, { cls: 'idea', onClick: () => toggleInList($('#foodText'), t) })));
}

/** "Detectado: 🥦 Verdura · 🍞 CHO" debajo de lo que escribes. */
function renderDetected() {
  const text = clean($('#foodText').value);
  const line = $('#detectedLine');
  line.hidden = !text;
  if (!text) return;
  const g = classifyMeal(text, state.overrides).groups;
  // Los grupos del menú ideal ya se ven marcados arriba: aquí solo lo demás.
  const extra = g.filter(x => !(form.wantedGroups || []).includes(x));
  $('#detectedText').textContent = !g.length ? 'No reconozco ningún grupo.'
    : extra.length ? `${(form.wantedGroups || []).length ? 'También' : 'Detectado'}: ${extra.map(groupLabel).join(' · ')}` : '';
  $('#fixGroupsBtn').textContent = extra.length || !g.length ? 'Corregir' : '¿Grupos mal? Corregir';
}

// ── Corregir grupos ──

let groupsEdit = null;

function openGroupsEditor(text, after) {
  const pieces = classifyMeal(text, state.overrides).pieces;
  if (!pieces.length) { toast('No hay nada que corregir'); return; }
  groupsEdit = { pieces: pieces.map(p => ({ ...p, groups: [...p.groups], orig: [...p.groups] })), after };
  const list = $('#groupsList');
  list.innerHTML = '';
  groupsEdit.pieces.forEach(p => {
    const row = document.createElement('div');
    row.className = 'gedit-row';
    const t = document.createElement('div');
    t.className = 'gedit-text';
    t.textContent = p.text + (p.corrected ? ' ✎' : '');
    row.appendChild(t);
    const chips = document.createElement('div');
    chips.className = 'chips';
    GROUPS.forEach(({ key }) => {
      chips.appendChild(makeChip(groupLabel(key), {
        on: p.groups.includes(key),
        cls: 'small',
        onClick: e => {
          const i = p.groups.indexOf(key);
          if (i >= 0) p.groups.splice(i, 1); else p.groups.push(key);
          e.currentTarget.classList.toggle('on', i < 0);
        }
      }));
    });
    row.appendChild(chips);
    list.appendChild(row);
  });
  $('#groupsSheet').showModal();
}

function saveGroups(e) {
  e.preventDefault();
  const changed = groupsEdit.pieces.filter(p => [...p.groups].sort().join() !== [...p.orig].sort().join());
  changed.forEach(p => {
    state.overrides[p.key] = p.groups;
    state.queue.push({ id: uid(), at: Date.now(), op: 'groups', key: p.key, groups: p.groups });
  });
  store.set('overrides', state.overrides);
  store.set('queue', state.queue);
  $('#groupsSheet').close();
  if (changed.length) toast('Corregido ✓');
  if (groupsEdit.after) groupsEdit.after();
  flush();
}

/** Resumen de hoy en la pantalla de registro: lo que aún falta. */
function renderTodayPlan() {
  const btn = $('#todayPlan');
  if (!currentScheme()) { btn.hidden = true; return; }
  const week = computeWeek(mondayOf(state.date));
  const day = week.days.find(d => d.date === state.date);
  if (!day || day.status === 'future') { btn.hidden = true; return; }
  const missing = GROUPS.map(g => g.key).filter(g => (day.target[g] || 0) > (day.actual[g] || 0));
  const pend = state.date === todayIso() ? Object.keys(week.pending).filter(g => !missing.includes(g)) : [];
  btn.hidden = false;
  if (!missing.length && !pend.length) { btn.textContent = '📋 Menú ideal de hoy cumplido ✓'; btn.className = 'today-plan ok'; return; }
  const parts = missing.map(g => `${GROUP[g].icon}${day.target[g] - (day.actual[g] || 0) > 1 ? '×' + (day.target[g] - (day.actual[g] || 0)) : ''}`);
  btn.textContent = `📋 Falta hoy: ${parts.join(' ')}` + (pend.length ? ` · pendiente: ${pend.map(g => GROUP[g].icon).join(' ')}` : '');
  btn.className = 'today-plan';
}

// ───────────────────────── Configuración guardada en el script ─────────────────────────

/** Descarga listas, diccionario y correcciones. */
async function loadConfig() {
  if (!state.settings.url || !navigator.onLine) return;
  try {
    const res = await api({ action: 'config' });
    // Lo que aún está en la cola manda sobre lo del servidor.
    const queued = Object.fromEntries(state.queue.filter(op => op.op === 'config').map(op => [op.name, op.value]));
    state.config = { ...res.config, ...queued };
    Object.keys(queued).forEach(k => { if (queued[k] === null) delete state.config[k]; });
    state.overrides = { ...res.overrides };
    state.queue.filter(op => op.op === 'groups').forEach(op => {
      if (op.groups === null) delete state.overrides[op.key]; else state.overrides[op.key] = op.groups;
    });
    state.scriptVersion = res.version;
    state.configLoaded = true;
    store.set('config', state.config);
    store.set('overrides', state.overrides);
    setCustomDictionary(state.config.DICT_CUSTOM);
    if (state.view === 'config') renderConfig(); else render();
  } catch (err) {
    state.lastError = err.message;
    renderSync();
  }
}

/** Guarda un ajuste (en el móvil al momento; en el script en cuanto haya conexión). */
function saveConfig(name, value) {
  state.config = state.config || {};
  if (value === null) delete state.config[name]; else state.config[name] = value;
  store.set('config', state.config);
  state.queue = state.queue.filter(op => !(op.op === 'config' && op.name === name));
  state.queue.push({ id: uid(), at: Date.now(), op: 'config', name, value });
  store.set('queue', state.queue);
  clearTimeout(saveConfig.timer);
  saveConfig.timer = setTimeout(flush, 800);   // agrupa varios cambios seguidos
  renderSync();
}

// ── Listas de botones (presets) ──

const AUTO_ADD_MIN = 3;   // veces en los últimos 30 días para añadirse sola
const PRESET_LISTS = [
  ...FOOD_SLOT_KEYS.map(k => ({ name: k, label: SLOT[k].short || SLOT[k].label, source: h => (h[k] || {}).items, seed: 16 })),
  { name: 'BEBIDAS', label: '💧 Bebida', source: h => (h.ALL || {}).bebidas, seed: 8, defaults: ['Agua'] },
  { name: 'SUPLEMENTOS', label: '💊 Suplementos', source: h => (h.ALL || {}).suplementos, seed: 6 },
  { name: 'LUGARES', label: '📍 Lugares', source: h => (h.ALL || {}).lugares, seed: 5, defaults: ['En casa', 'En la oficina', 'En restaurante'] }
];
const PRESET = Object.fromEntries(PRESET_LISTS.map(p => [p.name, p]));

/**
 * Botones de una lista, ordenados por uso. La primera vez se rellena con lo más usado del
 * histórico; después se añade solo lo que registres AUTO_ADD_MIN veces en 30 días
 * (salvo que lo hayas quitado).
 */
function presetItems(name) {
  const def = PRESET[name];
  const rows = (state.history && def.source(state.history)) || [];
  const cfgName = 'PRESETS_' + name;
  let cfg = state.config && state.config[cfgName];
  const dedupe = list => { const seen = new Set(); return list.filter(t => { const k = keyOf(t); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
  if (!cfg) {
    const seed = dedupe([...(def.defaults || []), ...rows.slice(0, def.seed).map(r => r[0])]);
    // Solo se guarda cuando ya sabemos lo que hay en el script (si no, se pisaría).
    if (!state.configLoaded || !state.history) return seed;
    cfg = { items: seed, hidden: [], auto: [] };
    saveConfig(cfgName, cfg);
  }
  const keys = new Set(cfg.items.map(keyOf));
  const hidden = new Set(cfg.hidden || []);
  const added = rows.filter(r => (r[2] || 0) >= AUTO_ADD_MIN && !keys.has(keyOf(r[0])) && !hidden.has(keyOf(r[0])));
  if (added.length && state.configLoaded) {
    cfg = { ...cfg, items: [...cfg.items, ...added.map(r => r[0])], auto: [...(cfg.auto || []), ...added.map(r => keyOf(r[0]))] };
    saveConfig(cfgName, cfg);
  }
  const rank = new Map(rows.map((r, i) => [keyOf(r[0]), i]));
  return cfg.items
    .map((t, i) => ({ t, r: rank.has(keyOf(t)) ? rank.get(keyOf(t)) : 1000 + i }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.t);
}

function presetConfig(name) {
  presetItems(name);   // asegura que exista
  const c = state.config && state.config['PRESETS_' + name];
  return c ? { items: [...c.items], hidden: [...(c.hidden || [])], auto: [...(c.auto || [])] } : null;
}

function editPreset(name, fn) {
  const cfg = presetConfig(name);
  if (!cfg) { toast('Conéctate primero para cargar tus listas'); return; }
  fn(cfg);
  saveConfig('PRESETS_' + name, cfg);
  renderPresetEditor();
}

// ───────────────────────── Pantalla de Ajustes ─────────────────────────

function renderConfig() {
  $('#dateText').textContent = 'Ajustes';
  $('#urlInput').value = state.settings.url;
  $('#tokenInput').value = state.settings.token;
  $('#settingsStatus').textContent = state.lastError ? `Último error: ${state.lastError}` : '';
  $('#appVersion').textContent = `App: versión ${APP_VERSION}`;
  $('#scriptVersion').textContent = state.scriptVersion
    ? `Script de Google: versión ${state.scriptVersion}${state.scriptVersion < APP_VERSION ? ' ⚠︎ actualízalo (Implementar → Nueva versión)' : ''}`
    : 'Script de Google: sin datos (conéctate para comprobarlo)';
  renderSync();
  renderPresetEditor();
  renderDictEditor();
  renderStravaConfig();
}

function renderPresetEditor() {
  const name = state.presetTab || 'DES';
  const tabs = $('#presetTabs');
  tabs.innerHTML = '';
  PRESET_LISTS.forEach(p => tabs.appendChild(makeChip(p.label, {
    on: p.name === name, cls: 'small',
    onClick: () => { state.presetTab = p.name; renderPresetEditor(); }
  })));
  const cfg = presetConfig(name);
  const list = $('#presetList');
  list.innerHTML = '';
  const items = cfg ? presetItems(name) : presetItems(name);
  const auto = new Set(cfg ? cfg.auto : []);
  items.forEach(t => {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = t;
    input.setAttribute('aria-label', 'Editar');
    input.addEventListener('change', () => {
      const v = input.value.trim();
      if (!v || v === t) { input.value = t; return; }
      editPreset(name, c => {
        c.items = c.items.map(x => (x === t ? v : x));
        if (keyOf(v) !== keyOf(t) && !c.hidden.includes(keyOf(t))) c.hidden.push(keyOf(t));   // que no vuelva el nombre viejo
        c.hidden = c.hidden.filter(h => h !== keyOf(v));
      });
    });
    li.appendChild(input);
    if (auto.has(keyOf(t))) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'auto'; b.title = 'Añadido solo por uso reciente'; li.appendChild(b); }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn small-x';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Quitar ${t}`);
    del.addEventListener('click', () => editPreset(name, c => {
      c.items = c.items.filter(x => x !== t);
      if (!c.hidden.includes(keyOf(t))) c.hidden.push(keyOf(t));
    }));
    li.appendChild(del);
    list.appendChild(li);
  });
  if (!items.length) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = 'Vacía. Añade algo abajo.'; list.appendChild(li); }

  const hidden = cfg ? cfg.hidden : [];
  $('#presetHiddenCount').textContent = hidden.length;
  $('#presetHiddenBox').hidden = !hidden.length;
  const hbox = $('#presetHidden');
  hbox.innerHTML = '';
  hidden.forEach(k => hbox.appendChild(makeChip(`↺ ${k}`, {
    cls: 'small', title: 'Volver a permitir',
    onClick: () => editPreset(name, c => { c.hidden = c.hidden.filter(h => h !== k); })
  })));
}

function addPreset(e) {
  e.preventDefault();
  const v = $('#presetAddInput').value.trim();
  if (!v) return;
  const name = state.presetTab || 'DES';
  editPreset(name, c => {
    if (!c.items.some(x => keyOf(x) === keyOf(v))) c.items.unshift(v);
    c.hidden = c.hidden.filter(h => h !== keyOf(v));
  });
  $('#presetAddInput').value = '';
}

function dictCustom() {
  const c = (state.config && state.config.DICT_CUSTOM) || {};
  return { add: { ...(c.add || {}) }, remove: { ...(c.remove || {}) } };
}

function saveDict(custom) {
  saveConfig('DICT_CUSTOM', custom);
  setCustomDictionary(custom);
  renderDictEditor();
}

function renderDictEditor() {
  const box = $('#dictGroups');
  const openGroups = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.g));
  box.innerHTML = '';
  GROUPS.forEach(({ key }) => {
    const words = dictionaryWords(key);
    const d = document.createElement('details');
    d.className = 'dict-group';
    d.dataset.g = key;
    d.open = openGroups.has(key);
    const sum = document.createElement('summary');
    sum.textContent = `${groupLabel(key)} (${words.length})`;
    d.appendChild(sum);
    const chips = document.createElement('div');
    chips.className = 'chips';
    words.forEach(({ word, custom }) => chips.appendChild(makeChip(`${custom ? '✎ ' : ''}${word} ✕`, {
      cls: 'small' + (custom ? ' custom' : ''),
      title: 'Quitar',
      onClick: () => {
        if (!confirm(`¿Quitar "${word}" de ${GROUP[key].label}?`)) return;
        const c = dictCustom();
        if (custom) c.add[key] = (c.add[key] || []).filter(w => keyOf(w) !== keyOf(word));
        else c.remove[key] = [...(c.remove[key] || []), word];
        saveDict(c);
      }
    })));
    d.appendChild(chips);
    const add = document.createElement('form');
    add.className = 'add-row';
    add.innerHTML = '<input type="text" placeholder="Añadir palabra…" autocomplete="off"><button type="submit" class="ghost">Añadir</button>';
    add.addEventListener('submit', e => {
      e.preventDefault();
      const v = add.querySelector('input').value.trim().toLowerCase();
      if (!v) return;
      const c = dictCustom();
      c.remove[key] = (c.remove[key] || []).filter(w => keyOf(w) !== keyOf(v));
      if (!dictionaryWords(key).some(w => keyOf(w.word) === keyOf(v))) c.add[key] = [...(c.add[key] || []), v];
      saveDict(c);
    });
    d.appendChild(add);
    const c = dictCustom();
    if ((c.add[key] || []).length || (c.remove[key] || []).length) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'link small';
      reset.textContent = 'Restablecer este grupo';
      reset.addEventListener('click', () => {
        if (!confirm(`¿Volver a las palabras originales de ${GROUP[key].label}?`)) return;
        const cc = dictCustom();
        delete cc.add[key];
        delete cc.remove[key];
        saveDict(cc);
      });
      d.appendChild(reset);
    }
    box.appendChild(d);
  });

  const list = $('#overrideList');
  list.innerHTML = '';
  const entries = Object.entries(state.overrides || {});
  if (!entries.length) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = 'Aún no has corregido nada.'; list.appendChild(li); }
  entries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, gs]) => {
    const li = document.createElement('li');
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'override-text';
    t.textContent = `${k} → ${gs.length ? gs.map(g => GROUP[g].icon).join(' ') : 'ningún grupo'}`;
    t.addEventListener('click', () => openGroupsEditor(k, renderDictEditor));
    li.appendChild(t);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn small-x';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Borrar corrección ${k}`);
    del.addEventListener('click', () => {
      delete state.overrides[k];
      store.set('overrides', state.overrides);
      state.queue.push({ id: uid(), at: Date.now(), op: 'groups', key: k, groups: null });
      store.set('queue', state.queue);
      renderDictEditor();
      flush();
    });
    li.appendChild(del);
    list.appendChild(li);
  });
}

// ───────────────────────── ¿Qué como? ─────────────────────────

const EAT_SLOTS = ['DES', 'MM1', 'MM2', 'COM', 'MER', 'AE', 'DU', 'DE', 'CEN'];
const MAIN_SLOTS = ['DES', 'COM', 'MER', 'CEN'];

/** Platos candidatos para una comida: combinaciones, tu lista de botones y el histórico. */
function mealCandidates(slotKey) {
  const h = state.history || {};
  const texts = [];
  const seen = new Set();
  const add = (t, combo) => {
    const k = keyOf(t);
    if (!k || seen.has(k)) return;
    seen.add(k);
    texts.push({ text: t, combo });
  };
  store.get('fav:' + slotKey, []).forEach(t => add(t, listOf(t).length > 1));
  ((h[slotKey] || {}).combos || []).forEach(r => add(r[0], true));
  presetItems(slotKey).forEach(t => add(t, false));
  ((h[slotKey] || {}).items || []).forEach(r => add(r[0], false));
  ((h.ALL || {}).items || []).slice(0, 150).forEach(r => add(r[0], false));
  // Propuestas cortas y realistas: nada de ensaladas de seis ingredientes ni platos de restaurante.
  return texts
    .filter(c => c.text.length <= 60 && listOf(c.text).length <= 3)
    .map(c => ({ ...c, groups: classifyMeal(c.text, state.overrides).groups }))
    .filter(c => c.groups.length);
}

function renderEat() {
  const d = parseIso(state.date);
  const isToday = state.date === todayIso();
  $('#dateText').textContent = `${isToday ? 'Hoy, ' : ''}${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const cards = $('#eatCards');
  const done = $('#eatDone');
  cards.innerHTML = '';
  done.innerHTML = '';
  if (!currentScheme()) {
    $('#eatIntro').textContent = state.settings.url ? 'Cargando tu menú ideal…' : 'Configura la conexión en Ajustes.';
    return;
  }
  const week = computeWeek(mondayOf(state.date));
  const day = week.days.find(x => x.date === state.date);
  const view = viewDay(state.date);
  const pend = Object.keys(week.pending);
  $('#eatIntro').textContent = pend.length
    ? `Propuestas con tus platos de siempre para cumplir el menú de hoy y recuperar lo pendiente de la semana: ${pend.map(groupLabel).join(', ')}.`
    : 'Propuestas con tus platos de siempre para cumplir el menú ideal de hoy.';

  state.eatVariant = state.eatVariant || {};
  let first = true;
  // Lo que ya cubren las propuestas anteriores del día (para no repetir plato ni lo pendiente).
  const plannedPending = new Set();
  const usedTexts = new Set();
  EAT_SLOTS.forEach(slot => {
    const exp = day && day.expectedSlots[slot];
    const has = (view.slots[slot] || '').trim();
    if (has) {
      if (exp || MAIN_SLOTS.includes(slot)) {
        const p = document.createElement('p');
        p.className = 'eat-done';
        p.textContent = `✓ ${SLOT[slot].label}: ${has.split('\n').join(' · ')}`;
        done.appendChild(p);
      }
      return;
    }
    if (!exp && !MAIN_SLOTS.includes(slot)) return;
    const wanted = suggestGroups(week, state.date, slot)
      .filter(w => !(w.reason === 'pending' && plannedPending.has(w.g) && (w.count || 1) <= 1));
    const needs = wanted.map(w => ({ g: w.g, weight: w.reason === 'pending' ? 3 : 1 }));
    const cands = mealCandidates(slot).filter(c => !usedTexts.has(keyOf(c.text)));
    const proposals = needs.length ? proposeMeals(needs, cands) : [];
    const v = (state.eatVariant[slot] || 0) % Math.max(1, proposals.length);
    const prop = proposals[v];
    if (prop) {
      prop.parts.forEach(t => { if (classifyMeal(t, state.overrides).groups.some(g => ['PESCADO', 'CARNE', 'HUEVO', 'LEGUMBRE'].includes(g))) usedTexts.add(keyOf(t)); });
      wanted.filter(w => w.reason === 'pending' && prop.covers.includes(w.g)).forEach(w => plannedPending.add(w.g));
    }

    const card = document.createElement('section');
    card.className = 'card eat-card' + (first ? ' next' : '');
    first = false;
    const head = document.createElement('div');
    head.className = 'eat-head';
    head.innerHTML = '<h3></h3><span class="hint"></span>';
    head.querySelector('h3').textContent = `${SLOT[slot].icon} ${SLOT[slot].label}`;
    head.querySelector('.hint').textContent = exp && exp.training ? '🏃 hoy entrenas' : exp && exp.libre ? '✨ con algo a elegir' : '';
    card.appendChild(head);

    const want = document.createElement('div');
    want.className = 'chips';
    wanted.forEach(w => {
      const c = document.createElement('span');
      c.className = 'gchip ' + (prop && prop.covers.includes(w.g) ? 'ok' : prop && prop.later.includes(w.g) ? 'future' : 'miss');
      c.textContent = groupLabel(w.g) + (w.reason === 'pending' ? ' · pendiente' : '') + (w.note ? ` (${w.note})` : '');
      want.appendChild(c);
    });
    if (exp && exp.during) { const c = document.createElement('span'); c.className = 'gchip future'; c.textContent = '💧 algo durante el entreno'; want.appendChild(c); }
    card.appendChild(want);

    const body = document.createElement('div');
    body.className = 'eat-proposal';
    if (prop) {
      const text = capFirst(prop.parts.map((t, i) => (i ? lowFirst(t) : t)).join(', '));
      body.innerHTML = '<p class="eat-text"></p>';
      body.querySelector('.eat-text').textContent = text;
      if (prop.later.length) {
        const m = document.createElement('p');
        m.className = 'hint';
        m.textContent = `${prop.later.map(groupLabel).join(', ')}: para otra comida (un solo plato de proteína por comida).`;
        body.appendChild(m);
      }
      if (prop.missing.length) {
        const m = document.createElement('p');
        m.className = 'hint';
        m.textContent = `No encuentro en tu histórico nada para: ${prop.missing.map(groupLabel).join(', ')}. Añádelo tú.`;
        body.appendChild(m);
      }
      const actions = document.createElement('div');
      actions.className = 'actions';
      if (proposals.length > 1) {
        const other = document.createElement('button');
        other.type = 'button';
        other.className = 'ghost';
        other.textContent = `Otra idea (${v + 1}/${proposals.length})`;
        other.addEventListener('click', () => { state.eatVariant[slot] = v + 1; renderEat(); });
        actions.appendChild(other);
      }
      const reg = document.createElement('button');
      reg.type = 'button';
      reg.className = 'primary';
      reg.textContent = 'Registrar esto';
      reg.addEventListener('click', () => registerProposal(slot, prop.parts));
      actions.appendChild(reg);
      body.appendChild(actions);
    } else {
      body.innerHTML = `<p class="hint">${wanted.length ? 'Aún no tengo platos en tu histórico para proponerte algo.' : 'El menú ideal no pide nada concreto: lo que te apetezca.'}</p>`;
      const reg = document.createElement('button');
      reg.type = 'button';
      reg.className = 'ghost';
      reg.textContent = 'Registrar';
      reg.addEventListener('click', () => { switchView('register'); openEntry(slot); });
      body.appendChild(reg);
    }
    card.appendChild(body);
    cards.appendChild(card);
  });
  if (!cards.children.length) {
    const p = document.createElement('p');
    p.className = 'card';
    p.textContent = '🎉 Ya has registrado todas las comidas de hoy.';
    cards.appendChild(p);
  }
}

/** Abre el registro de esa comida con la propuesta ya escrita, para ajustarla y guardar. */
function registerProposal(slot, parts) {
  switchView('register');
  openEntry(slot);
  const ta = $('#foodText');
  ta.value = capFirst(parts.map((t, i) => (i ? lowFirst(t) : t)).join(', '));
  ta.dispatchEvent(new Event('input'));
}

// ───────────────────────── Strava ─────────────────────────

const STRAVA_MIN_GAP = 5 * 60 * 1000;

/** Pide al script las actividades nuevas (y con "escribir solo", las escribe). */
async function syncStrava(force) {
  if (!state.settings.url || !navigator.onLine) return;
  const s = state.strava;
  if (s.status && !s.status.connected && !force) return;
  if (!force && Date.now() - (s.at || 0) < STRAVA_MIN_GAP) return;
  try {
    const res = await api({ action: 'stravaSync' });
    const resolved = new Set(state.queue.filter(op => op.op === 'stravaMark').map(op => op.stravaId));
    state.strava = { status: res.strava, pending: res.pending.filter(e => !resolved.has(e.id)), at: Date.now() };
    store.set('strava', state.strava);
    if (res.written.length) {
      toast(`Strava: añadido ${res.written.map(e => e.line.replace(/^\d{1,2}:\d{2}\s*/, '')).join(' · ')}`);
      for (const d of new Set(res.written.map(e => e.date))) await refreshDay(d);
    }
    if (state.view === 'config') renderStravaConfig();
    else render();
  } catch (err) {
    state.lastError = err.message;
    renderSync();
  }
}

function renderStravaCard() {
  const card = $('#stravaCard');
  const list = $('#stravaList');
  const pending = (state.strava.pending || []);
  card.hidden = !pending.length;
  list.innerHTML = '';
  pending.forEach(e => {
    const row = document.createElement('div');
    row.className = 'strava-item';
    const d = parseIso(e.date);
    const title = document.createElement('p');
    title.className = 'strava-line';
    title.textContent = e.line;
    const meta = document.createElement('p');
    meta.className = 'hint';
    meta.textContent = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${SLOT[e.slot].label}${e.name ? ' · «' + e.name + '»' : ''}`;
    row.append(title, meta);
    if (e.existing) {
      const ex = document.createElement('p');
      ex.className = 'hint';
      ex.textContent = `Ya tienes en el Sheet: ${e.existing.split('\n').join(' · ')}`;
      row.appendChild(ex);
    }
    if (e.error) {
      const er = document.createElement('p');
      er.className = 'hint';
      er.textContent = `⚠︎ ${e.error}`;
      row.appendChild(er);
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'ghost';
    dismiss.textContent = 'Descartar';
    dismiss.addEventListener('click', () => resolveStrava(e.id, 'dismissed'));
    const review = document.createElement('button');
    review.type = 'button';
    review.className = 'primary';
    review.textContent = 'Revisar y añadir';
    review.disabled = !!e.error;
    review.addEventListener('click', () => reviewStrava(e));
    actions.append(dismiss, review);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

/** Abre el registro de esa actividad con la línea ya escrita, para añadir "base", "ritmo bajo"… */
function reviewStrava(e) {
  if (state.view !== 'register') switchView('register');
  setDate(e.date);
  openEntry(e.slot);
  form.stravaId = e.id;
  form.mode = 'text';
  applyMode();
  $('#timeInput').value = e.time.padStart(5, '0');
  $('#lineText').value = e.line;
  form.lineDirty = true;
  updateLine();
}

function resolveStrava(id, status) {
  state.strava.pending = (state.strava.pending || []).filter(e => e.id !== id);
  store.set('strava', state.strava);
  state.queue.push({ id: uid(), at: Date.now(), op: 'stravaMark', stravaId: id, status });
  store.set('queue', state.queue);
  render();
  flush();
}

function renderStravaConfig() {
  const st = state.strava.status;
  $('#stravaSetup').hidden = !st || st.configured;
  $('#stravaStatus').textContent = !st ? 'Comprobando…'
    : !st.configured ? 'Sin configurar.'
      : st.connected ? `✓ Conectado${st.athlete ? ' como ' + st.athlete : ''}.` : 'No conectado.';
  $('#stravaAuto').checked = !!(state.config && state.config.STRAVA_SETTINGS && state.config.STRAVA_SETTINGS.auto);
  $('#stravaAuto').disabled = !st || !st.connected;
  $('#stravaConnectBtn').hidden = !st || !st.configured;
  $('#stravaConnectBtn').textContent = st && st.connected ? 'Reconectar' : 'Conectar con Strava';
  $('#stravaDisconnectBtn').hidden = !st || !st.connected;
}

async function connectStrava() {
  try {
    const { url } = await api({ action: 'stravaAuthUrl', redirect: state.settings.url });
    // En el iPhone se abre en Safari; al terminar, vuelve a la app.
    window.open(url, '_blank') || (location.href = url);
    toast('Autoriza en Strava y vuelve a la app');
  } catch (err) {
    toast(`Error: ${err.message}`);
  }
}

async function disconnectStrava() {
  if (!confirm('¿Desconectar Strava? Dejará de proponerte actividades.')) return;
  try {
    const res = await api({ action: 'stravaDisconnect' });
    state.strava = { status: res.strava, pending: [], at: Date.now() };
    store.set('strava', state.strava);
    renderStravaConfig();
  } catch (err) {
    toast(`Error: ${err.message}`);
  }
}

// ───────────────────────── Arranque ─────────────────────────

function init() {
  const step = n => {
    if (state.view === 'plan') { state.weekStart = addDays(state.weekStart, 7 * n); renderPlan(); loadWeek(state.weekStart); }
    else setDate(addDays(state.date, n));
  };
  $('#prevDay').addEventListener('click', () => step(-1));
  $('#nextDay').addEventListener('click', () => step(1));
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.view === 'plan') state.weekStart = mondayOf(state.date);
    switchView(b.dataset.view);
  }));
  $('#fixGroupsBtn').addEventListener('click', () => openGroupsEditor(clean($('#foodText').value), () => { renderDetected(); renderPlanBlock(); }));
  $('#groupsForm').addEventListener('submit', saveGroups);
  $('#presetAddForm').addEventListener('submit', addPreset);
  $('#reloadBtn').addEventListener('click', () => location.reload());
  $('#stravaConnectBtn').addEventListener('click', connectStrava);
  $('#stravaDisconnectBtn').addEventListener('click', disconnectStrava);
  $('#stravaAuto').addEventListener('change', e => {
    saveConfig('STRAVA_SETTINGS', { auto: e.target.checked });
    toast(e.target.checked ? 'Las actividades se escribirán solas' : 'Te propondré cada actividad');
  });
  $('#goToday').addEventListener('click', () => setDate(isoDate(new Date())));
  $('#dateInput').addEventListener('change', e => {
    if (!e.target.value) return;
    if (state.view === 'plan') { state.weekStart = mondayOf(e.target.value); state.date = e.target.value; renderPlan(); loadWeek(state.weekStart); }
    else setDate(e.target.value);
  });
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
    form.lineDirty = false;
    updateLine();
  });
  document.querySelectorAll('#foodTabs button').forEach(b => b.addEventListener('click', () => setFoodTab(b.dataset.tab)));
  ['#drinkOther', '#suppOther'].forEach(sel => {
    const el = $(sel);
    el.addEventListener('change', () => addOtherToList(el));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOtherToList(el); } });
  });
  $('#placeOther').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  $('#placeOther').addEventListener('input', () => {
    form.place = $('#placeOther').value.trim();
    form.lineDirty = false;
    updateLine();
  });
  $('#harvardOn').addEventListener('change', updateLine);
  $('#searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
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
    loadWeek(mondayOf(state.date));
    syncStrava(state.view === 'config');   // al volver de autorizar en Strava, se actualiza
  });

  store.set('lastOpen', state.date);
  state.weekStart = mondayOf(state.date);
  setCustomDictionary(state.config && state.config.DICT_CUSTOM);
  switchView(state.view);
  loadConfig();
  if (!state.settings.url) openSettings();
  refreshDay(state.date);
  loadHistory();
  loadWeek(state.weekStart);
  flush();
  syncStrava();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
