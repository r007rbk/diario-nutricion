'use strict';
/*
 * Menú ideal: clasificar comida en grupos, leer el esquema del Sheet y calcular
 * el cumplimiento por día y por semana. Sin dependencias: lo usa app.js y los tests.
 */

const GROUPS = [
  { key: 'VERDURA', label: 'Verdura', icon: '🥦' },
  { key: 'FRUTA', label: 'Fruta', icon: '🍎' },
  { key: 'CHO', label: 'CHO', icon: '🍞', title: 'Hidratos: pan, arroz, pasta, patata, avena…' },
  { key: 'LACTEO', label: 'Lácteo', icon: '🥛' },
  { key: 'PESCADO', label: 'Pescado', icon: '🐟' },
  { key: 'LEGUMBRE', label: 'Legumbre', icon: '🫘' },
  { key: 'CARNE', label: 'Carne', icon: '🍗' },
  { key: 'HUEVO', label: 'Huevo', icon: '🥚' },
  { key: 'FS', label: 'Frutos secos', icon: '🥜' }
];
const GROUP = Object.fromEntries(GROUPS.map(g => [g.key, g]));

// Palabras (sin acentos, en minúsculas) que identifican cada grupo. Se comprueban
// como prefijo de palabra: "lenteja" encuentra "lentejas".
const DICTIONARY = {
  PESCADO: ['pescado', 'rape', 'merluza', 'salmon', 'lubina', 'atun', 'sardin', 'bacalao', 'dorada', 'lenguado',
    'gamba', 'gambon', 'langostin', 'mejillon', 'calamar', 'chipiron', 'chopito', 'pulpo', 'sepia', 'boqueron',
    'anchoa', 'trucha', 'emperador', 'marisco', 'almeja', 'berberecho', 'caballa', 'rodaballo', 'surimi',
    'salmonete', 'nigiri', 'sushi', 'maki', 'sashimi', 'pez ', 'bonito', 'perca', 'panga', 'besugo', 'navaja',
    'vieira', 'cigala', 'nécora', 'centollo', 'angula', 'gula', 'kubak', 'anguila', 'cazon', 'pota', 'jurel', 'chicharro'],
  CARNE: ['carne', 'pollo', 'pavo', 'ternera', 'cerdo', 'lomo', 'solomillo', 'filete', 'hamburguesa', 'albondiga',
    'chuleta', 'costilla', 'jamon', 'chorizo', 'salchich', 'cordero', 'conejo', 'pechuga', 'contramuslo', 'muslo',
    'cachopo', 'morcilla', 'oreja', 'molleja', 'entrecot', 'secreto', 'kebab', 'york', 'butifarra', 'pato',
    'foie', 'fiambre', 'embutido', 'longaniza', 'lacon', 'cecina', 'carrillera', 'rabo', 'picada', 'bistec',
    'escalope', 'san jacobo', 'flamenquin', 'pinchos morunos', 'alitas', 'nuggets', 'bacon', 'panceta', 'pepito'],
  HUEVO: ['huevo', 'tortilla', 'revuelto', 'francesa', 'clara ', 'claras ', 'yema'],
  LEGUMBRE: ['lenteja', 'garbanzo', 'alubia', 'judia blanca', 'judias blancas', 'judia pinta', 'judias pintas',
    'judia roja', 'judias rojas', 'judion', 'hummus', 'humus', 'soja', 'edamame', 'frijol', 'potaje', 'fabada',
    'cocido', 'falafel', 'tofu', 'azuki', 'guisante', 'habas', 'legumbre'],
  VERDURA: ['verdura', 'ensalada', 'lechuga', 'tomate', 'tomatito', 'tomates cherry', 'pimiento', 'cebolla', 'calabacin', 'berenjena', 'brocoli',
    'coliflor', 'espinaca', 'acelga', 'judias verdes', 'judia verde', 'zanahoria', 'pepino', 'rucula', 'champinon',
    'seta', 'esparrago', 'alcachofa', 'puerro', 'calabaza', 'pisto', 'gazpacho', 'salmorejo', 'crema de', 'pure de',
    'col ', 'coles ', 'repollo', 'canonigo', 'remolacha', 'apio', 'menestra', 'escarola', 'endibia', 'lombarda', 'kale',
    'pepinillo', 'piparra', 'rabano', 'aguacate', 'guacamole', 'cogollo', 'brotes', 'germinado', 'vainas', 'grelos',
    'borraja', 'cardo', 'nabo', 'hortaliza', 'pak choi', 'wok'],
  FRUTA: ['fruta', 'manzana', 'pera', 'platano', 'banana', 'naranja', 'mandarina', 'kiwi', 'fresa', 'melon', 'sandia',
    'uva', 'melocoton', 'nectarina', 'paraguaya', 'pina', 'mango', 'arandano', 'frambuesa', 'cereza', 'ciruela',
    'higo', 'pomelo', 'granada', 'guayaba', 'papaya', 'albaricoque', 'caqui', 'chirimoya', 'macedonia', 'compota',
    'mora', 'lichi', 'maracuya', 'datil', 'orejon', 'pasas', 'membrillo', 'limon'],
  LACTEO: ['leche', 'yogur', 'queso', 'kefir', 'actimel', 'cuajada', 'requeson', 'skyr', 'natillas', 'cortado',
    'batido', 'lacteo', 'skir', 'helado', 'mozzarella', 'mozzarela', 'parmesano', 'burgos', 'feta', 'ricotta', 'quark', 'petit',
    'flan', 'arroz con leche', 'nata', 'mantequilla', 'cafe con leche', 'capuccino', 'latte'],
  CHO: ['pan ', 'panes ', 'panecillo', 'tostada', 'tosta', 'arroz', 'pasta', 'espagueti', 'spaguetti', 'espaguetis', 'macarron', 'fideo',
    'fideua', 'tallarin', 'noodle', 'patata', 'avena', 'quinoa', 'cuscus', 'cous', 'cereal', 'muesli', 'granola',
    'tortita', 'wrap', 'pizza', 'galleta', 'bizcocho', 'bollo', 'bollito', 'croissant', 'magdalena', 'maiz', 'boniato',
    'gnocchi', 'nioqui', 'lasana', 'empanada', 'empanadilla', 'nachos', 'totopo', 'bocadillo', 'sandwich', 'paella',
    'risotto', 'oatibix', 'biscote', 'picos', 'regaña', 'barrita', 'pad thai', 'ramen', 'canelon', 'raviol',
    'tortellini', 'bulgur', 'mijo', 'trigo', 'centeno', 'espelta', 'crepe', 'tortita de arroz', 'tarta', 'churro',
    'porra', 'mermelada', 'miel', 'pita', 'arepa', 'burrito', 'fajita', 'quesadilla', 'croqueta', 'sobao',
    'polenta', 'tapioca', 'yuca', 'ensaladilla', 'harina', 'rebozado', 'empanado', 'gofre', 'tortilla de patata', 'patatas'],
  FS: ['nuez', 'nueces', 'almendra', 'avellana', 'pistacho', 'anacardo', 'cacahuete', 'frutos secos', 'pipas',
    'piñones', 'pinones', 'macadamia', 'crema de cacahuete', 'semillas']
};
// Excepciones: "judías verdes" no es legumbre; "tortita" no es huevo; "leche de avena/soja" no es lácteo animal…
const DICT_EXCLUDE = {
  LEGUMBRE: ['judias verdes', 'judia verde', 'salsa de soja', 'leche de soja', 'guisantes congelados con'],
  HUEVO: ['tortita', 'tortilla de trigo', 'tortilla integral', 'tortilla mexicana', 'tortilla de maiz'],
  CARNE: ['de pollo de', 'pez espada'],
  VERDURA: ['crema de cacahuete', 'pure de patata', 'tomate frito', 'pan con tomate', 'pan integral con tomate', 'tostada con tomate', 'tostada de pan integral con tomate', 'tomate rallado'],
  CHO: ['pan de molde integral'],
  LACTEO: ['leche de avena', 'leche de almendra', 'leche de soja', 'bebida de avena'],
  PESCADO: []
};

const normText = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\s+/g, ' ').trim();
const pieceKey = s => normText(s).replace(/[.,;:]+$/, '').replace(/^(?:(?:y|e|con|1|un|una)\s+)+(?=\D)/, '').trim();

function wordMatch(text, word) {
  // Prefijo de palabra: "lenteja" encuentra "lentejas", pero "pera" no encuentra "esperar".
  // Si la palabra del diccionario acaba en espacio, tiene que ser la palabra entera ("pan " ≠ "panceta").
  const exact = word.endsWith(' ');
  const w = normText(word);
  let i = text.indexOf(w);
  while (i !== -1) {
    const before = i === 0 || /[^a-z0-9]/.test(text[i - 1]);
    const after = !exact || i + w.length >= text.length || /[^a-z0-9]/.test(text[i + w.length]);
    if (before && after) return true;
    i = text.indexOf(w, i + 1);
  }
  return false;
}

/** Grupos de un trozo de texto (sin tener en cuenta correcciones). */
function classifyByDictionary(text) {
  let t = ' ' + normText(text) + ' ';
  const found = new Set();
  for (const g of Object.keys(DICTIONARY)) {
    let tt = t;
    for (const ex of DICT_EXCLUDE[g] || []) tt = tt.split(normText(ex)).join(' ');
    if (DICTIONARY[g].some(w => wordMatch(tt.trim(), w))) found.add(g);
  }
  // "pan con tomate" no cuenta como ración de verdura; el resto de tomate sí.
  return [...found];
}

/** Separa una línea del Sheet en trozos clasificables. */
function splitFoodPieces(line) {
  return String(line || '')
    .replace(/^\s*\d{1,2}[:.]?\d{2}\b/, '')
    .replace(/\b(bebidas?|suplementos?)\s*:[^.]*/gi, '')          // bebida y suplementos no cuentan
    .split(/[.,;\n()]|\s+y\s+(?=\S)/)
    .map(s => s.trim())
    .filter(s => s && !/^en (casa|la oficina|el trabajo|restaurante|un restaurante)/i.test(s));
}

/**
 * Grupos de una comida (texto de una franja). overrides: {clave: [grupos]} con las
 * correcciones del usuario, que mandan sobre el diccionario.
 * Devuelve { groups: [...], pieces: [{text, key, groups, corrected}] }
 */
function classifyMeal(text, overrides) {
  overrides = overrides || {};
  const pieces = [];
  const groups = new Set();
  // Primero se comprueba si la línea entera o la frase tiene una corrección.
  for (const line of String(text || '').split('\n')) {
    for (const piece of splitFoodPieces(line)) {
      const key = pieceKey(piece);
      if (!key) continue;
      const corrected = Object.prototype.hasOwnProperty.call(overrides, key);
      const g = corrected ? overrides[key] : classifyByDictionary(piece);
      g.forEach(x => groups.add(x));
      pieces.push({ text: piece, key, groups: g, corrected });
    }
  }
  return { groups: [...groups], pieces };
}

// ───────────────────────── Esquema del Sheet ─────────────────────────

const SCHEME_ROWS = [
  [/^DESAYUNO/, 'DES'], [/^MM ?1/, 'MM1'], [/^MM ?2/, 'MM2'], [/^COMIDA/, 'COM'], [/^MERIENDA/, 'MER'],
  [/^CENA/, 'CEN'], [/^POST/, 'DE'], [/^PRE/, 'AE'], [/^ANTES/, 'AE'], [/^DURANTE/, 'DU']
];
const WEEKDAYS_UP = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const TOKEN_GROUP = [
  [/^LACTEO/, 'LACTEO'], [/^FRUTA/, 'FRUTA'], [/^CHO/, 'CHO'], [/^FS\b/, 'FS'], [/^FRUTOS SECOS/, 'FS'],
  [/^VERDURA/, 'VERDURA'], [/^PESCADO/, 'PESCADO'], [/^LEGUMBRE/, 'LEGUMBRE'], [/^CARNE/, 'CARNE'], [/^HUEVO/, 'HUEVO']
];

/**
 * values: la pestaña "ESQUEMA DE MENÚ IDEAL" como tabla (filas × columnas).
 * Devuelve days[0..6] (lunes..domingo) = { training: texto, slots: { DES: {groups:[{g, note}], training:bool, libre:bool}, … } }
 */
function parseScheme(values) {
  const up = v => normText(v).toUpperCase();
  let headerRow = -1;
  const colOf = {};
  for (let r = 0; r < values.length && headerRow < 0; r++) {
    values[r].forEach((v, c) => { const i = WEEKDAYS_UP.indexOf(up(v)); if (i >= 0) colOf[i] = c; });
    if (Object.keys(colOf).length >= 5) headerRow = r;
  }
  if (headerRow < 0) return null;
  const days = WEEKDAYS_UP.map((_, d) => ({
    training: headerRow > 0 ? String(values[headerRow - 1][colOf[d]] || '').trim() : '',
    slots: {}
  }));
  for (let r = headerRow + 1; r < values.length; r++) {
    const label = up(values[r][0]);
    const rule = SCHEME_ROWS.find(([re]) => re.test(label));
    if (!rule) continue;
    let slot = rule[1];
    const isPost = slot === 'DE';
    days.forEach((day, d) => {
      const cell = String(values[r][colOf[d]] || '').trim();
      if (!cell) return;
      if (up(cell) === 'DURANTE') {            // "DURANTE" en MM2 el finde: comer durante el entreno
        day.slots.DU = { groups: [], training: true, libre: false, during: true };
        return;
      }
      // "**" = a elegir: no exige nada más (en la comida del sábado: verdura + CHO + lo que quieras)
      let libre = false;
      const groups = [];
      cell.split(/\n|\+/).map(s => s.trim()).filter(Boolean).forEach(tok => {
        if (/^\*+$/.test(tok)) { libre = true; return; }
        const t = up(tok);
        const m = TOKEN_GROUP.find(([re]) => re.test(t));
        if (m) groups.push({ g: m[1], note: tok.replace(/^\S+\s*/, '').trim().toLowerCase() });
      });
      const prev = day.slots[slot];
      if (prev) { prev.groups.push(...groups); prev.libre = prev.libre || libre; }
      else day.slots[slot] = { groups, training: isPost, libre };
    });
  }
  return days;
}

// ───────────────────────── Cumplimiento ─────────────────────────

const FOOD_SLOT_KEYS = ['DES', 'MM1', 'MM2', 'COM', 'MER', 'AE', 'DU', 'DE', 'CEN'];
// Grupos que rotan por días: si un día falla, se recupera otro día de la semana.
// El resto (fruta, verdura, lácteo, CHO, frutos secos) se cumple cada día y no se arrastra.
const WEEKLY_GROUPS = ['PESCADO', 'LEGUMBRE', 'CARNE', 'HUEVO'];
const weekdayIndex = iso => (new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).getDay() + 6) % 7;

/** Lunes de la semana de una fecha. */
function mondayOf(iso) {
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  d.setDate(d.getDate() - weekdayIndex(iso));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Un día: qué tocaba (target por grupo), qué hubo (actual por grupo) y detalle por franja.
 * slots: contenido de las franjas del día. trained: ¿hubo Entreno o Gym?
 * Cada grupo cuenta como mucho 1 por franja (una ración por comida).
 */
function evaluateDay(schemeDay, slots, overrides, trained) {
  const target = {};
  const actual = {};
  const meals = {};
  const expectedSlots = {};
  if (schemeDay) {
    for (const [slot, s] of Object.entries(schemeDay.slots)) {
      if (s.training && !trained) continue;
      expectedSlots[slot] = { groups: s.groups, training: s.training, during: !!s.during, libre: s.libre };
      s.groups.forEach(({ g }) => { target[g] = (target[g] || 0) + 1; });
    }
  }
  for (const slot of FOOD_SLOT_KEYS) {
    const text = slots[slot] || '';
    if (!text.trim()) continue;
    const c = classifyMeal(text, overrides);
    meals[slot] = c;
    c.groups.forEach(g => { actual[g] = (actual[g] || 0) + 1; });
  }
  return { target, actual, meals, expectedSlots, trained };
}

/**
 * Semana: days = [{date, slots}] de lunes a domingo; today = fecha de hoy (ISO).
 * Los días futuros no cuentan como fallo, pero sí su objetivo (para saber lo que queda).
 * pending[g] = lo que debería llevar hasta ayer − lo que lleva hasta ayer (si > 0):
 * es lo que hay que recuperar otro día de la semana.
 */
function evaluateWeek(scheme, days, overrides, today) {
  const out = { days: [], target: {}, actual: {}, pending: {}, targetToDate: {}, actualToDate: {} };
  for (const day of days) {
    const wd = weekdayIndex(day.date);
    const schemeDay = scheme ? scheme[wd] : null;
    const trained = !!((day.slots.ENT || '').trim() || (day.slots.GYM || '').trim());
    const ev = evaluateDay(schemeDay, day.slots, overrides, trained);
    ev.date = day.date;
    ev.status = day.date > today ? 'future' : day.date === today ? 'today' : 'past';
    ev.schemeTraining = schemeDay ? schemeDay.training : '';
    out.days.push(ev);
    const add = (obj, src) => Object.entries(src).forEach(([g, n]) => { obj[g] = (obj[g] || 0) + n; });
    add(out.target, ev.target);
    if (ev.status !== 'future') add(out.actual, ev.actual);
    if (ev.status === 'past') { add(out.targetToDate, ev.target); add(out.actualToDate, ev.actual); }
  }
  for (const g of Object.keys(out.targetToDate).filter(x => WEEKLY_GROUPS.includes(x))) {
    const miss = out.targetToDate[g] - (out.actualToDate[g] || 0);
    if (miss > 0) out.pending[g] = miss;
  }
  return out;
}

/**
 * Qué sugerir al registrar una franja: lo que pide el esquema para esa comida y
 * lo pendiente de días anteriores de la semana (sin repetir lo ya tomado hoy).
 * Devuelve [{g, reason: 'scheme'|'pending', note, count}]
 */
function suggestGroups(week, date, slot) {
  const day = week && week.days.find(d => d.date === date);
  if (!day) return [];
  const already = new Set((day.meals[slot] && day.meals[slot].groups) || []);
  const out = [];
  const exp = day.expectedSlots[slot];
  if (exp) {
    exp.groups.forEach(({ g, note }) => { if (!already.has(g)) out.push({ g, reason: 'scheme', note }); });
  }
  // Lo pendiente solo en comidas principales (comida y cena), donde cabe recuperar pescado, legumbre…
  if (['COM', 'CEN'].includes(slot)) {
    for (const [g, n] of Object.entries(week.pending)) {
      const todayLeft = Math.max(0, (day.target[g] || 0) - (day.actual[g] || 0));
      // Si hoy ya tocaba ese grupo en otra comida, la deuda sigue; se sugiere igualmente.
      if (!out.some(x => x.g === g) && !already.has(g)) out.push({ g, reason: 'pending', count: n, todayLeft });
    }
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { GROUPS, WEEKLY_GROUPS, classifyMeal, classifyByDictionary, parseScheme, evaluateDay, evaluateWeek, suggestGroups, mondayOf, pieceKey };
}
