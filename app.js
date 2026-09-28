'use strict';

/* =========================================================
   Relatórios de Campo — PWA offline para técnicos
   Dados ficam somente no aparelho (IndexedDB).
   ========================================================= */

/* ---------- Constantes ---------- */
const APP_VERSION = '1.0.0';

const HTIPOS = {
  trabalho:     { n: 'Trabalho no cliente', i: '🛠️' },
  remoto:       { n: 'Suporte remoto',      i: '💻' },
  deslocamento: { n: 'Deslocamento',        i: '🚌' },
  espera:       { n: 'Espera / stand-by',   i: '⏳' },
};
const MEIOS = {
  onibus: { n: 'Ônibus', i: '🚌' },
  aviao:  { n: 'Avião',  i: '✈️' },
  carro:  { n: 'Carro',  i: '🚗' },
  outro:  { n: 'Outro',  i: '🚆' },
};
const CATS = {
  alimentacao:    { n: 'Alimentação',     i: '🍽️' },
  hospedagem:     { n: 'Hospedagem',      i: '🏨' },
  uber:           { n: 'Táxi / Uber',     i: '🚕' },
  onibus:         { n: 'Ônibus',          i: '🚌' },
  aereo:          { n: 'Passagem aérea',  i: '✈️' },
  combustivel:    { n: 'Combustível',     i: '⛽' },
  pedagio:        { n: 'Pedágio',         i: '🛣️' },
  estacionamento: { n: 'Estacionamento',  i: '🅿️' },
  outros:         { n: 'Outros',          i: '📦' },
};
const PAGTOS = {
  pessoal:  'Cartão pessoal',
  pix:      'PIX',
  dinheiro: 'Dinheiro',
  empresa:  'Cartão da empresa',
  cliente:  'Pago pelo cliente',
};
const ATIPOS = {
  viagem: { n: 'Viagem',           i: '✈️' },
  local:  { n: 'Presencial local', i: '🏢' },
  remoto: { n: 'Suporte remoto',   i: '💻' },
};
const STATUS = { aberto: 'Em andamento', fechado: 'Fechado (a receber)', pago: 'Pago' };
const STATUS_CURTO = { aberto: 'Aberto', fechado: 'A receber', pago: 'Pago' };

const defaultRates = () => ({
  hora: 0, jornada: 8, extraPct: 50, fdsPct: 100,
  remotoHora: 0, remotoMin: 60, remotoFracao: 30,
  cobraDesloc: false, deslocHora: 0,
  deslocMeios: { onibus: true, aviao: false, carro: true, outro: false },
  kmValor: 0, alimTeto: 0,
  reembolsa: { alimentacao: true, hospedagem: true, uber: true, onibus: true, aereo: true,
               combustivel: true, pedagio: true, estacionamento: true, outros: false },
  fornecePassagem: false, forneceHotel: false,
});

/* ---------- Utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = (v, d = 2) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoDate(new Date());
const nowHM = (d = new Date()) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';
const dateObj = iso => new Date(iso + 'T12:00:00');
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WDL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const weekday = iso => WD[dateObj(iso).getDay()];
const hm = min => { min = Math.round(min || 0); return Math.floor(min / 60) + 'h' + pad(min % 60); };
const hdec = min => numFmt((min || 0) / 60);
function monthRange(iso) {
  const d = dateObj(iso);
  return { from: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = iso => { const d = dateObj(iso); return MESES[d.getMonth()] + ' de ' + d.getFullYear(); };

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
const radioChips = (name, map, val) => Object.entries(map).map(([k, v]) =>
  `<label class="chip"><input type="radio" name="${name}" value="${k}" ${k === val ? 'checked' : ''}><span>${v.i} ${v.n}</span></label>`).join('');
const options = (map, val) => Object.entries(map).map(([k, v]) =>
  `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(typeof v === 'string' ? v : v.n)}</option>`).join('');

/* ---------- Banco de dados (IndexedDB) ---------- */
const STORES = ['clients', 'atends', 'horas', 'despesas', 'kms', 'files', 'kv'];
let idb;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('relatorios-campo', 1);
    r.onupgradeneeded = () => STORES.forEach(s => {
      if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
    });
    r.onsuccess = () => { idb = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
function req(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = idb.transaction(store, mode);
    const q = fn(t.objectStore(store));
    t.oncomplete = () => res(q && q.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const dbAll = s => req(s, 'readonly', st => st.getAll());
const dbGet = (s, id) => req(s, 'readonly', st => st.get(id));
const dbPut = (s, o) => req(s, 'readwrite', st => st.put(o));
const dbDel = (s, id) => req(s, 'readwrite', st => st.delete(id));
const dbClear = s => req(s, 'readwrite', st => st.clear());

/* ---------- Estado em memória ---------- */
const S = { clients: [], atends: [], horas: [], despesas: [], kms: [], settings: { id: 'settings' }, timer: null };
async function loadAll() {
  for (const k of ['clients', 'atends', 'horas', 'despesas', 'kms']) S[k] = await dbAll(k);
  S.settings = (await dbGet('kv', 'settings')) || { id: 'settings', nome: 'HS Systems' };
  S.timer = ((await dbGet('kv', 'timer')) || {}).value || null;
}
async function save(store, obj) {
  obj.updatedAt = new Date().toISOString();
  const arr = S[store];
  const i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  await dbPut(store, obj);
}
async function remove(store, id) {
  S[store] = S[store].filter(x => x.id !== id);
  await dbDel(store, id);
}
async function saveSettings() { await dbPut('kv', S.settings); }
async function setTimer(v) { S.timer = v; await dbPut('kv', { id: 'timer', value: v }); }

const fileCache = new Map();
async function getFile(id) {
  if (fileCache.has(id)) return fileCache.get(id);
  const f = await dbGet('files', id);
  if (f) fileCache.set(id, f);
  return f;
}
async function putFile(f) { fileCache.set(f.id, f); await dbPut('files', f); }
async function delFile(id) { fileCache.delete(id); await dbDel('files', id); }

/* ---------- Consultas ---------- */
const client = id => S.clients.find(c => c.id === id);
const atend = id => S.atends.find(a => a.id === id);
const atendLabel = a => { const c = client(a.clientId); return (c ? c.nome : 'Sem cliente') + (a.titulo ? ' — ' + a.titulo : ''); };
function ratesOf(a) {
  const d = defaultRates();
  const r = (a && client(a.clientId) || {}).rates || {};
  return { ...d, ...r, deslocMeios: { ...d.deslocMeios, ...(r.deslocMeios || {}) }, reembolsa: { ...d.reembolsa, ...(r.reembolsa || {}) } };
}
const openAtends = () => S.atends.filter(a => a.status === 'aberto').sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
function defaultAtendId() {
  const open = openAtends();
  const last = S.settings.lastAtend;
  if (last && open.some(a => a.id === last)) return last;
  return open[0] ? open[0].id : '';
}
function datesOf(aId) {
  const set = new Set();
  for (const k of ['horas', 'despesas', 'kms']) S[k].forEach(x => { if (x.atendId === aId && x.data) set.add(x.data); });
  return [...set].sort();
}
function dayEntries(aId, date) {
  const byTime = (a, b) => (a.inicio || '').localeCompare(b.inicio || '');
  return {
    hs: S.horas.filter(h => h.atendId === aId && h.data === date).sort(byTime),
    ds: S.despesas.filter(d => d.atendId === aId && d.data === date),
    ks: S.kms.filter(k => k.atendId === aId && k.data === date),
  };
}

/* ---------- Cálculos ---------- */
function durMin(h) {
  if (!h.inicio || !h.fim) return 0;
  const [a, b] = h.inicio.split(':').map(Number), [c, d] = h.fim.split(':').map(Number);
  let m = (c * 60 + d) - (a * 60 + b);
  if (m <= 0) m += 1440; // passou da meia-noite
  return Math.max(0, m - num(h.intervalo));
}
function remotoFat(min, r) {
  const f = Math.max(1, num(r.remotoFracao) || 1);
  return Math.max(Math.ceil(min / f) * f, num(r.remotoMin));
}
const kmOf = k => Math.max(0, num(k.kmFinal) - num(k.kmInicial)) || num(k.kmTotal);
const CALC_KEYS = ['trabMin', 'normalMin', 'extraMin', 'fdsMin', 'naoCobMin', 'deslocMin', 'deslocCobMin', 'remotoMin', 'remotoFatMin',
  'vNormal', 'vExtra', 'vFds', 'vDesloc', 'vRemoto', 'km', 'kmCob', 'vKm', 'despTotal', 'despReemb', 'alimGlosa', 'vHoras', 'total'];
const emptyCalc = () => Object.fromEntries(CALC_KEYS.map(k => [k, 0]));
function sumCalc(list) {
  const t = emptyCalc();
  list.forEach(c => CALC_KEYS.forEach(k => { t[k] += c[k] || 0; }));
  return t;
}
function calcDay(a, date) {
  const r = ratesOf(a), c = emptyCalc();
  const { hs, ds, ks } = dayEntries(a.id, date);
  let work = 0, fer = false;
  hs.forEach(h => {
    const m = durMin(h);
    if (h.feriado) fer = true;
    if (h.tipo === 'trabalho' || h.tipo === 'espera') {
      c.trabMin += m;
      if (h.cobrar !== false) work += m; else c.naoCobMin += m;
    } else if (h.tipo === 'deslocamento') {
      c.deslocMin += m;
      if (h.cobrar !== false) c.deslocCobMin += m;
    } else if (h.tipo === 'remoto') {
      c.remotoMin += m;
      if (h.cobrar !== false) c.remotoFatMin += remotoFat(m, r);
    }
  });
  const dow = dateObj(date).getDay();
  if (fer || dow === 0 || dow === 6) c.fdsMin = work;
  else {
    const j = (num(r.jornada) || 8) * 60;
    c.normalMin = Math.min(work, j);
    c.extraMin = Math.max(0, work - j);
  }
  const hr = num(r.hora);
  c.vNormal = c.normalMin / 60 * hr;
  c.vExtra = c.extraMin / 60 * hr * (1 + num(r.extraPct) / 100);
  c.vFds = c.fdsMin / 60 * hr * (1 + num(r.fdsPct) / 100);
  c.vDesloc = c.deslocCobMin / 60 * num(r.deslocHora);
  c.vRemoto = c.remotoFatMin / 60 * num(r.remotoHora);
  c.vHoras = c.vNormal + c.vExtra + c.vFds + c.vDesloc + c.vRemoto;

  ks.forEach(k => { const km = kmOf(k); c.km += km; if (k.cobrar !== false) c.kmCob += km; });
  c.vKm = c.kmCob * num(r.kmValor);

  let alim = 0;
  ds.forEach(d => {
    const v = num(d.valor);
    c.despTotal += v;
    if (d.reembolsavel !== false) { if (d.categoria === 'alimentacao') alim += v; else c.despReemb += v; }
  });
  const teto = num(r.alimTeto);
  c.alimGlosa = teto > 0 && alim > teto ? alim - teto : 0;
  c.despReemb += alim - c.alimGlosa;

  c.total = c.vHoras + c.vKm + c.despReemb;
  return c;
}
function calcAtend(a, from, to) {
  const dates = datesOf(a.id).filter(d => (!from || d >= from) && (!to || d <= to));
  const days = dates.map(d => ({ date: d, c: calcDay(a, d) }));
  const tot = sumCalc(days.map(x => x.c));
  const full = !from && !to;
  tot.adiant = full ? num(a.adiantamento) : 0;
  tot.liquido = tot.total - tot.adiant;
  return { days, tot };
}
function defaultCobrarHora(a, tipo, meio) {
  if (tipo !== 'deslocamento') return true;
  const r = ratesOf(a);
  return !!(r.cobraDesloc && r.deslocMeios[meio]);
}
function defaultReemb(a, cat, pag) {
  if (pag === 'cliente') return false;
  return !!ratesOf(a).reembolsa[cat];
}

/* ---------- Imagens ---------- */
function readFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
async function compressImage(file, max = 1600, q = 0.72) {
  const url = await readFile(file);
  if (!file.type.startsWith('image/')) return url;
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', q);
  } catch { return url; }
}

/* =========================================================
   Folha de formulário (bottom sheet)
   ========================================================= */
let sheetState = null;
function openSheet({ title, body, onSave, onDelete, onMount, saveLabel = 'Salvar', deleteLabel = 'Excluir' }) {
  const el = $('#sheet');
  el.innerHTML = `
    <form class="sheet" id="sheetForm" novalidate>
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" data-act="close-sheet" aria-label="Fechar">✕</button></div>
      <div class="sheet-body">${body}</div>
      <div class="sheet-foot">
        ${onDelete ? `<button type="button" class="btn danger" id="sheetDel">${esc(deleteLabel)}</button>` : ''}
        ${onSave ? `<button type="submit" class="btn">${esc(saveLabel)}</button>` : `<button type="button" class="btn ghost" data-act="close-sheet">Fechar</button>`}
      </div>
    </form>`;
  el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const form = $('#sheetForm');
  sheetState = { form };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const bad = $$('[required]', form).find(i => !String(i.value).trim());
    if (bad) { bad.focus(); toast('Preencha os campos obrigatórios'); return; }
    const fd = {};
    new FormData(form).forEach((v, k) => { fd[k] = v; });
    try {
      const ok = await onSave(fd, form);
      if (ok === false) return;
      closeSheet(); render();
    } catch (err) { console.error(err); toast('Erro ao salvar: ' + err.message); }
  });
  if (onDelete) $('#sheetDel').addEventListener('click', async () => {
    if (!confirm('Confirma excluir?')) return;
    await onDelete(); closeSheet(); render(); toast('Excluído');
  });
  el.onclick = e => { if (e.target === el) closeSheet(); };
  if (onMount) onMount(form);
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
  sheetState = null;
}

function atendSelect(id) {
  const list = openAtends();
  const cur = atend(id);
  if (cur && !list.includes(cur)) list.unshift(cur);
  return `<label>Atendimento
    <select name="atendId" required>
      ${list.length ? '' : '<option value="">— nenhum atendimento em andamento —</option>'}
      ${list.map(a => `<option value="${a.id}" ${a.id === id ? 'selected' : ''}>${esc(atendLabel(a))}</option>`).join('')}
    </select></label>`;
}
function requireOpenAtend() {
  if (!openAtends().length) {
    toast('Crie um atendimento primeiro');
    if (!S.clients.length) { location.hash = '#/clients'; setTimeout(() => clientForm(), 50); }
    else { location.hash = '#/atends'; setTimeout(() => atendForm(), 50); }
    return false;
  }
  return true;
}

/* ---------- Formulário: Cliente ---------- */
function clientForm(c) {
  const isNew = !c;
  c = c || { id: uid(), nome: '', rates: defaultRates() };
  const r = { ...defaultRates(), ...c.rates };
  r.deslocMeios = { ...defaultRates().deslocMeios, ...(c.rates || {}).deslocMeios };
  r.reembolsa = { ...defaultRates().reembolsa, ...(c.rates || {}).reembolsa };
  const v = x => (x === 0 || x) ? esc(String(x).replace('.', ',')) : '';
  openSheet({
    title: isNew ? 'Novo cliente' : 'Editar cliente',
    body: `
      <fieldset><legend>🏢 Dados do cliente</legend>
        <label>Nome / Razão social *<input name="nome" required value="${esc(c.nome)}"></label>
        <div class="row2">
          <label>CNPJ / CPF<input name="documento" value="${esc(c.documento)}"></label>
          <label>Cidade<input name="cidade" value="${esc(c.cidade)}"></label>
        </div>
        <label>Endereço<input name="endereco" value="${esc(c.endereco)}"></label>
        <div class="row2">
          <label>Contato (responsável)<input name="contato" value="${esc(c.contato)}"></label>
          <label>Telefone<input name="telefone" type="tel" value="${esc(c.telefone)}"></label>
        </div>
        <label>E-mail<input name="email" type="email" value="${esc(c.email)}"></label>
      </fieldset>

      <fieldset><legend>🛠️ Horas no cliente</legend>
        <div class="row2">
          <label>Valor da hora (R$)<input name="hora" inputmode="decimal" value="${v(r.hora)}" placeholder="0,00"></label>
          <label>Jornada normal (h/dia)<input name="jornada" inputmode="decimal" value="${v(r.jornada)}"></label>
        </div>
        <div class="row2">
          <label>Hora extra (+%)<input name="extraPct" inputmode="decimal" value="${v(r.extraPct)}"></label>
          <label>Sáb/Dom/feriado (+%)<input name="fdsPct" inputmode="decimal" value="${v(r.fdsPct)}"></label>
        </div>
        <p class="hint">Acima da jornada diária vira hora extra. Sábado, domingo e dias marcados como feriado usam o adicional de fim de semana.</p>
      </fieldset>

      <fieldset><legend>💻 Suporte remoto</legend>
        <label>Valor da hora remota (R$)<input name="remotoHora" inputmode="decimal" value="${v(r.remotoHora)}" placeholder="0,00"></label>
        <div class="row2">
          <label>Cobrança mínima (min)<input name="remotoMin" inputmode="numeric" value="${v(r.remotoMin)}"></label>
          <label>Arredondar a cada (min)<input name="remotoFracao" inputmode="numeric" value="${v(r.remotoFracao)}"></label>
        </div>
        <p class="hint">Ex.: mínimo 60 e fração 30 → um acesso de 20 min cobra 1h; um de 70 min cobra 1h30.</p>
      </fieldset>

      <fieldset><legend>🚌 Hora de deslocamento</legend>
        <label class="check"><input type="checkbox" name="cobraDesloc" ${r.cobraDesloc ? 'checked' : ''}> Cobrar horas de deslocamento</label>
        <label>Valor da hora de deslocamento (R$)<input name="deslocHora" inputmode="decimal" value="${v(r.deslocHora)}" placeholder="0,00"></label>
        <label class="lbl">Cobrar quando o deslocamento for de:</label>
        ${Object.entries(MEIOS).map(([k, m]) => `<label class="check"><input type="checkbox" name="meio_${k}" ${r.deslocMeios[k] ? 'checked' : ''}> ${m.i} ${m.n}</label>`).join('')}
      </fieldset>

      <fieldset><legend>🚗 Carro próprio</legend>
        <label>Valor por km rodado (R$)<input name="kmValor" inputmode="decimal" value="${v(r.kmValor)}" placeholder="0,00"></label>
      </fieldset>

      <fieldset><legend>🧾 Reembolso de despesas</legend>
        <label class="lbl">O cliente reembolsa:</label>
        ${Object.entries(CATS).map(([k, m]) => `<label class="check"><input type="checkbox" name="reemb_${k}" ${r.reembolsa[k] ? 'checked' : ''}> ${m.i} ${m.n}</label>`).join('')}
        <label>Teto diário de alimentação (R$, 0 = sem teto)<input name="alimTeto" inputmode="decimal" value="${v(r.alimTeto)}"></label>
        <label class="check"><input type="checkbox" name="fornecePassagem" ${r.fornecePassagem ? 'checked' : ''}> Cliente compra as passagens (aéreo/ônibus)</label>
        <label class="check"><input type="checkbox" name="forneceHotel" ${r.forneceHotel ? 'checked' : ''}> Cliente paga a hospedagem</label>
      </fieldset>

      <label>Observações<textarea name="obs" rows="2">${esc(c.obs)}</textarea></label>`,
    onSave: async fd => {
      const n = k => num(fd[k]);
      Object.assign(c, {
        nome: fd.nome.trim(), documento: fd.documento, cidade: fd.cidade, endereco: fd.endereco,
        contato: fd.contato, telefone: fd.telefone, email: fd.email, obs: fd.obs,
        rates: {
          hora: n('hora'), jornada: n('jornada') || 8, extraPct: n('extraPct'), fdsPct: n('fdsPct'),
          remotoHora: n('remotoHora'), remotoMin: n('remotoMin'), remotoFracao: n('remotoFracao') || 1,
          cobraDesloc: !!fd.cobraDesloc, deslocHora: n('deslocHora'),
          deslocMeios: Object.fromEntries(Object.keys(MEIOS).map(k => [k, !!fd['meio_' + k]])),
          kmValor: n('kmValor'), alimTeto: n('alimTeto'),
          reembolsa: Object.fromEntries(Object.keys(CATS).map(k => [k, !!fd['reemb_' + k]])),
          fornecePassagem: !!fd.fornecePassagem, forneceHotel: !!fd.forneceHotel,
        },
      });
      await save('clients', c);
      toast('Cliente salvo');
    },
    onDelete: isNew ? null : async () => {
      if (S.atends.some(a => a.clientId === c.id)) { alert('Este cliente tem atendimentos. Exclua-os antes.'); return; }
      await remove('clients', c.id);
    },
  });
}

/* ---------- Formulário: Atendimento ---------- */
function atendForm(a, preset = {}) {
  if (!S.clients.length) { toast('Cadastre um cliente primeiro'); location.hash = '#/clients'; setTimeout(() => clientForm(), 50); return; }
  const isNew = !a;
  a = a || { id: uid(), clientId: preset.clientId || S.clients[0].id, tipo: 'viagem', titulo: '', inicio: today(), fim: '', status: 'aberto' };
  openSheet({
    title: isNew ? 'Novo atendimento' : 'Editar atendimento',
    body: `
      <label>Cliente *<select name="clientId" required>${S.clients.slice().sort((x, y) => x.nome.localeCompare(y.nome))
        .map(c => `<option value="${c.id}" ${c.id === a.clientId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="lbl">Tipo</label><div class="chips">${radioChips('tipo', ATIPOS, a.tipo)}</div>
      <label>Título / objetivo *<input name="titulo" required value="${esc(a.titulo)}" placeholder="Ex.: Implantação sistema — Outubro"></label>
      <p class="hint">Para suporte remoto recorrente, crie um atendimento por mês (ex.: "Suporte remoto — Out/2026") e lance cada acesso nele.</p>
      <div class="row2">
        <label>Cidade / local<input name="cidade" value="${esc(a.cidade)}"></label>
        <label>Nº chamado / OS<input name="os" value="${esc(a.os)}"></label>
      </div>
      <div class="row2">
        <label>Início<input type="date" name="inicio" value="${a.inicio || ''}"></label>
        <label>Término<input type="date" name="fim" value="${a.fim || ''}"></label>
      </div>
      <label>Adiantamento recebido (R$)<input name="adiantamento" inputmode="decimal" value="${a.adiantamento ? esc(String(a.adiantamento).replace('.', ',')) : ''}" placeholder="0,00"></label>
      <label>Status<select name="status">${options(STATUS, a.status)}</select></label>
      <label>Resumo / observações do atendimento (sai no relatório)<textarea name="obs" rows="4">${esc(a.obs)}</textarea></label>`,
    onSave: async fd => {
      Object.assign(a, { clientId: fd.clientId, tipo: fd.tipo || 'viagem', titulo: fd.titulo.trim(), cidade: fd.cidade, os: fd.os,
        inicio: fd.inicio, fim: fd.fim, adiantamento: num(fd.adiantamento), status: fd.status, obs: fd.obs });
      await save('atends', a);
      if (isNew) { S.settings.lastAtend = a.id; await saveSettings(); location.hash = '#/atend/' + a.id; }
      toast('Atendimento salvo');
    },
    onDelete: isNew ? null : async () => {
      for (const k of ['horas', 'kms', 'despesas']) {
        for (const x of S[k].filter(x => x.atendId === a.id)) {
          for (const f of x.fotos || []) await delFile(f);
          await remove(k, x.id);
        }
      }
      await remove('atends', a.id);
      location.hash = '#/atends';
    },
  });
}

/* ---------- Formulário: Horas ---------- */
function horaForm(h, preset = {}) {
  if (!h && !requireOpenAtend()) return;
  const isNew = !h;
  const aId = preset.atendId || defaultAtendId();
  const a0 = atend(aId);
  h = h || { id: uid(), atendId: aId, data: preset.data || today(), tipo: preset.tipo || (a0 && a0.tipo === 'remoto' ? 'remoto' : 'trabalho'),
    inicio: preset.inicio || '', fim: preset.fim || '', intervalo: '', descricao: '', meio: 'onibus', feriado: false };
  const cobrarInit = isNew ? defaultCobrarHora(a0, h.tipo, h.meio) : h.cobrar !== false;
  openSheet({
    title: isNew ? 'Lançar horas' : 'Editar horas',
    body: `
      ${atendSelect(h.atendId)}
      <label class="lbl">Tipo</label><div class="chips">${radioChips('tipo', HTIPOS, h.tipo)}</div>
      <div id="meioBox"><label class="lbl">Meio de transporte</label><div class="chips">${radioChips('meio', MEIOS, h.meio || 'onibus')}</div></div>
      <label>Data<input type="date" name="data" required value="${h.data}"></label>
      <div class="row3">
        <label>Início<input type="time" name="inicio" required value="${h.inicio}"></label>
        <label>Fim<input type="time" name="fim" required value="${h.fim}"></label>
        <label>Pausa (min)<input name="intervalo" inputmode="numeric" value="${h.intervalo || ''}" placeholder="0"></label>
      </div>
      <div id="durPrev" class="info-box">—</div>
      <label>Descrição da atividade<textarea name="descricao" rows="4" placeholder="O que foi feito, problemas encontrados, soluções…">${esc(h.descricao)}</textarea></label>
      <label class="check"><input type="checkbox" name="feriado" ${h.feriado ? 'checked' : ''}> É feriado (aplica adicional de fim de semana)</label>
      <label class="check"><input type="checkbox" name="cobrar" id="cobrarChk" ${cobrarInit ? 'checked' : ''}> Cobrar estas horas do cliente</label>`,
    onSave: async fd => {
      Object.assign(h, { atendId: fd.atendId, data: fd.data, tipo: fd.tipo, meio: fd.tipo === 'deslocamento' ? fd.meio : undefined,
        inicio: fd.inicio, fim: fd.fim, intervalo: num(fd.intervalo), descricao: fd.descricao.trim(), feriado: !!fd.feriado, cobrar: !!fd.cobrar });
      await save('horas', h);
      S.settings.lastAtend = h.atendId; await saveSettings();
      toast('Horas salvas: ' + hm(durMin(h)));
    },
    onDelete: isNew ? null : async () => remove('horas', h.id),
    onMount: form => {
      let touched = false;
      $('#cobrarChk').addEventListener('change', () => { touched = true; });
      const upd = () => {
        const tipo = form.elements.tipo.value, meio = form.elements.meio.value;
        const a = atend(form.elements.atendId.value);
        $('#meioBox').hidden = tipo !== 'deslocamento';
        if (!touched && isNew) $('#cobrarChk').checked = defaultCobrarHora(a, tipo, meio);
        const tmp = { inicio: form.elements.inicio.value, fim: form.elements.fim.value, intervalo: form.elements.intervalo.value };
        const m = durMin(tmp);
        let txt = m ? `⏱️ Duração: <b>${hm(m)}</b>` : 'Informe início e fim';
        if (m && tipo === 'remoto' && a) {
          const r = ratesOf(a), f = remotoFat(m, r);
          txt += ` · Faturado: <b>${hm(f)}</b> = ${brl(f / 60 * r.remotoHora)}`;
        }
        if (tipo === 'deslocamento' && a && !ratesOf(a).cobraDesloc) txt += '<br><small>Este cliente não está configurado para cobrar deslocamento.</small>';
        $('#durPrev').innerHTML = txt;
      };
      form.addEventListener('change', upd);
      form.addEventListener('input', upd);
      upd();
    },
  });
}

/* ---------- Formulário: Despesa ---------- */
function despForm(d, preset = {}) {
  if (!d && !requireOpenAtend()) return;
  const isNew = !d;
  d = d || { id: uid(), atendId: preset.atendId || defaultAtendId(), data: preset.data || today(), categoria: 'alimentacao', valor: '', descricao: '', pagamento: 'pessoal', fotos: [] };
  const att = []; // {id, data, name, type, isNew}
  const reembInit = isNew ? defaultReemb(atend(d.atendId), d.categoria, d.pagamento) : d.reembolsavel !== false;
  openSheet({
    title: isNew ? 'Nova despesa' : 'Editar despesa',
    body: `
      ${atendSelect(d.atendId)}
      <label class="lbl">Categoria</label><div class="chips">${radioChips('categoria', CATS, d.categoria)}</div>
      <div id="despWarn"></div>
      <div class="row2">
        <label>Valor (R$) *<input name="valor" required inputmode="decimal" value="${d.valor !== '' ? esc(String(d.valor).replace('.', ',')) : ''}" placeholder="0,00"></label>
        <label>Data<input type="date" name="data" required value="${d.data}"></label>
      </div>
      <label>Descrição / estabelecimento<input name="descricao" value="${esc(d.descricao)}" placeholder="Ex.: Almoço — Restaurante X"></label>
      <div class="row2">
        <label>Pagamento<select name="pagamento">${options(PAGTOS, d.pagamento)}</select></label>
        <label>Nº nota / cupom<input name="nota" value="${esc(d.nota)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="reembolsavel" id="reembChk" ${reembInit ? 'checked' : ''}> Cobrar / reembolsar do cliente</label>
      <label class="lbl">Comprovantes</label>
      <div class="thumbs" id="thumbs"></div>
      <div class="attach-btns">
        <label><input type="file" accept="image/*" capture="environment" id="camIn"><span>📷 Fotografar</span></label>
        <label><input type="file" accept="image/*,application/pdf" multiple id="fileIn"><span>📎 Anexar arquivo</span></label>
      </div>`,
    onSave: async fd => {
      if (!num(fd.valor)) { toast('Informe o valor'); return false; }
      const keep = [];
      for (const f of att) {
        if (f.isNew) await putFile({ id: f.id, atendId: fd.atendId, name: f.name, type: f.type, data: f.data });
        keep.push(f.id);
      }
      for (const old of d.fotos || []) if (!keep.includes(old)) await delFile(old);
      Object.assign(d, { atendId: fd.atendId, data: fd.data, categoria: fd.categoria, valor: num(fd.valor), descricao: fd.descricao.trim(),
        pagamento: fd.pagamento, nota: fd.nota, reembolsavel: !!fd.reembolsavel, fotos: keep });
      await save('despesas', d);
      S.settings.lastAtend = d.atendId; await saveSettings();
      toast('Despesa salva');
    },
    onDelete: isNew ? null : async () => { for (const f of d.fotos || []) await delFile(f); await remove('despesas', d.id); },
    onMount: async form => {
      let touched = false;
      $('#reembChk').addEventListener('change', () => { touched = true; });
      const upd = () => {
        const a = atend(form.elements.atendId.value), cat = form.elements.categoria.value, pag = form.elements.pagamento.value;
        if (!touched && isNew) $('#reembChk').checked = defaultReemb(a, cat, pag);
        const r = ratesOf(a); let w = '';
        if (r.fornecePassagem && (cat === 'aereo' || cat === 'onibus')) w = '⚠️ Este cliente compra as passagens. Confira antes de lançar como reembolsável.';
        if (r.forneceHotel && cat === 'hospedagem') w = '⚠️ Este cliente paga a hospedagem.';
        if (!r.reembolsa[cat]) w = w || 'ℹ️ Pela regra deste cliente, esta categoria não é reembolsada.';
        if (cat === 'alimentacao' && num(r.alimTeto) > 0) w = w || `ℹ️ Teto diário de alimentação: ${brl(num(r.alimTeto))}.`;
        $('#despWarn').innerHTML = w ? `<div class="alert">${w}</div>` : '';
      };
      form.addEventListener('change', upd); upd();
      const draw = () => {
        $('#thumbs').innerHTML = att.map((f, i) => `<div class="thumb">${f.type.startsWith('image') ? `<img src="${f.data}" data-view="${i}">` : `📄<br>${esc(f.name || 'PDF')}`}<button type="button" data-rm="${i}">✕</button></div>`).join('')
          || '<span class="muted small">Nenhum comprovante anexado.</span>';
      };
      $('#thumbs').addEventListener('click', e => {
        if (e.target.dataset.rm !== undefined) { att.splice(+e.target.dataset.rm, 1); draw(); }
        else if (e.target.dataset.view !== undefined) showImage(att[+e.target.dataset.view].data);
      });
      const onFiles = async e => {
        for (const file of e.target.files) {
          const data = await compressImage(file);
          att.push({ id: uid(), data, name: file.name, type: file.type.startsWith('image') ? 'image/jpeg' : file.type, isNew: true });
        }
        e.target.value = ''; draw();
      };
      $('#camIn').addEventListener('change', onFiles);
      $('#fileIn').addEventListener('change', onFiles);
      for (const fid of d.fotos || []) { const f = await getFile(fid); if (f) att.push({ ...f, isNew: false }); }
      draw();
    },
  });
}

/* ---------- Formulário: Km ---------- */
function kmForm(k, preset = {}) {
  if (!k && !requireOpenAtend()) return;
  const isNew = !k;
  k = k || { id: uid(), atendId: preset.atendId || defaultAtendId(), data: preset.data || today(), origem: '', destino: '', kmInicial: '', kmFinal: '', fotos: [] };
  const att = [];
  openSheet({
    title: isNew ? 'Deslocamento de carro' : 'Editar deslocamento',
    body: `
      ${atendSelect(k.atendId)}
      <label>Data<input type="date" name="data" required value="${k.data}"></label>
      <div class="row2">
        <label>Origem<input name="origem" value="${esc(k.origem)}"></label>
        <label>Destino<input name="destino" value="${esc(k.destino)}"></label>
      </div>
      <div class="row2">
        <label>Km inicial<input name="kmInicial" inputmode="decimal" value="${esc(k.kmInicial)}"></label>
        <label>Km final<input name="kmFinal" inputmode="decimal" value="${esc(k.kmFinal)}"></label>
      </div>
      <label>…ou total de km rodados<input name="kmTotal" inputmode="decimal" value="${esc(k.kmTotal)}"></label>
      <div id="kmPrev" class="info-box">—</div>
      <label>Observação<input name="obs" value="${esc(k.obs)}" placeholder="Ex.: ida e volta hotel → cliente"></label>
      <label class="check"><input type="checkbox" name="cobrar" ${k.cobrar !== false ? 'checked' : ''}> Cobrar km do cliente</label>
      <label class="lbl">Foto do painel (opcional)</label>
      <div class="thumbs" id="thumbs"></div>
      <div class="attach-btns"><label><input type="file" accept="image/*" capture="environment" id="camIn"><span>📷 Fotografar painel</span></label></div>
      <p class="hint">Para pedágio, combustível e estacionamento use "Despesa".</p>`,
    onSave: async fd => {
      const keep = [];
      for (const f of att) { if (f.isNew) await putFile({ id: f.id, atendId: fd.atendId, name: f.name, type: f.type, data: f.data }); keep.push(f.id); }
      for (const old of k.fotos || []) if (!keep.includes(old)) await delFile(old);
      Object.assign(k, { atendId: fd.atendId, data: fd.data, origem: fd.origem, destino: fd.destino, kmInicial: fd.kmInicial, kmFinal: fd.kmFinal,
        kmTotal: fd.kmTotal, obs: fd.obs, cobrar: !!fd.cobrar, fotos: keep });
      if (!kmOf(k)) { toast('Informe os km'); return false; }
      await save('kms', k);
      toast('Deslocamento salvo');
    },
    onDelete: isNew ? null : async () => { for (const f of k.fotos || []) await delFile(f); await remove('kms', k.id); },
    onMount: async form => {
      const upd = () => {
        const km = kmOf({ kmInicial: form.elements.kmInicial.value, kmFinal: form.elements.kmFinal.value, kmTotal: form.elements.kmTotal.value });
        const r = ratesOf(atend(form.elements.atendId.value));
        $('#kmPrev').innerHTML = km ? `🚗 <b>${numFmt(km, 1)} km</b> × ${brl(r.kmValor)} = <b>${brl(km * r.kmValor)}</b>` : 'Informe km inicial/final ou total';
      };
      form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
      const draw = () => { $('#thumbs').innerHTML = att.map((f, i) => `<div class="thumb"><img src="${f.data}"><button type="button" data-rm="${i}">✕</button></div>`).join(''); };
      $('#thumbs').addEventListener('click', e => { if (e.target.dataset.rm !== undefined) { att.splice(+e.target.dataset.rm, 1); draw(); } });
      $('#camIn').addEventListener('change', async e => {
        for (const file of e.target.files) att.push({ id: uid(), data: await compressImage(file), name: file.name, type: 'image/jpeg', isNew: true });
        e.target.value = ''; draw();
      });
      for (const fid of k.fotos || []) { const f = await getFile(fid); if (f) att.push({ ...f, isNew: false }); }
      draw();
    },
  });
}

/* ---------- Assinatura ---------- */
function signForm(a) {
  let drawn = false;
  openSheet({
    title: 'Assinatura do cliente',
    body: `
      <p class="hint" style="margin:0 0 12px">Peça ao responsável para assinar com o dedo. A assinatura sai no relatório do atendimento.</p>
      <div class="row2">
        <label>Nome *<input name="nome" required value="${esc((a.assinatura || {}).nome || (client(a.clientId) || {}).contato || '')}"></label>
        <label>Cargo<input name="cargo" value="${esc((a.assinatura || {}).cargo || '')}"></label>
      </div>
      <div class="sigwrap"><canvas id="sig"></canvas></div>
      <button type="button" class="btn ghost sm" id="sigClear">Limpar</button>
      ${a.assinatura ? `<p class="small muted">Assinatura atual registrada em ${new Date(a.assinatura.data).toLocaleString('pt-BR')}. Assinar novamente substitui.</p>` : ''}`,
    onSave: async fd => {
      if (!drawn) { toast('Assinatura em branco'); return false; }
      a.assinatura = { nome: fd.nome, cargo: fd.cargo, img: $('#sig').toDataURL('image/png'), data: new Date().toISOString() };
      await save('atends', a); toast('Assinatura registrada');
    },
    onDelete: a.assinatura ? async () => { delete a.assinatura; await save('atends', a); } : null,
    deleteLabel: 'Remover',
    onMount: () => {
      const cv = $('#sig'), dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1f5c';
      let down = false;
      const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener('pointerdown', e => { down = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
      cv.addEventListener('pointermove', e => { if (!down) return; ctx.lineTo(...pos(e)); ctx.stroke(); drawn = true; });
      const up = () => { down = false; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      $('#sigClear').addEventListener('click', () => { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; });
    },
  });
}

/* ---------- Cronômetro ---------- */
function timerStart() {
  if (!requireOpenAtend()) return;
  const aId = defaultAtendId(), a = atend(aId);
  openSheet({
    title: 'Iniciar cronômetro',
    body: `${atendSelect(aId)}<label class="lbl">Tipo</label><div class="chips">${radioChips('tipo', HTIPOS, a && a.tipo === 'remoto' ? 'remoto' : 'trabalho')}</div>
      <div id="meioBox" hidden><label class="lbl">Meio de transporte</label><div class="chips">${radioChips('meio', MEIOS, 'onibus')}</div></div>
      <p class="hint">Ao parar, o formulário de horas abre já preenchido para você descrever a atividade.</p>`,
    saveLabel: '▶️ Iniciar',
    onSave: async fd => { await setTimer({ atendId: fd.atendId, tipo: fd.tipo, meio: fd.meio, start: Date.now() }); toast('Cronômetro iniciado'); },
    onMount: form => form.addEventListener('change', () => { $('#meioBox').hidden = form.elements.tipo.value !== 'deslocamento'; }),
  });
}
async function timerStop() {
  const t = S.timer; if (!t) return;
  await setTimer(null);
  const st = new Date(t.start);
  render();
  horaForm(null, { atendId: t.atendId, tipo: t.tipo, data: isoDate(st), inicio: nowHM(st), fim: nowHM() });
  if (t.meio && sheetState) { const r = $(`input[name="meio"][value="${t.meio}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
}
function elapsed(ms) { const s = Math.floor(ms / 1000); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); }
setInterval(() => { const el = $('#clock'); if (el && S.timer) el.textContent = elapsed(Date.now() - S.timer.start); }, 1000);

/* ---------- Visualizador de imagem ---------- */
function showImage(src) {
  const v = $('#viewer');
  v.innerHTML = `<img src="${src}"><button class="btn" type="button">Fechar</button>`;
  v.classList.remove('hidden');
  v.onclick = () => { v.classList.add('hidden'); v.innerHTML = ''; };
}
async function showFile(id) {
  const f = await getFile(id); if (!f) return;
  if (f.type.startsWith('image')) showImage(f.data);
  else { const w = window.open(); if (w) w.document.write(`<iframe src="${f.data}" style="border:0;width:100%;height:100%"></iframe>`); }
}

/* =========================================================
   Telas
   ========================================================= */
function setChrome({ title, back, tab, right = '' }) {
  $('#title').textContent = title;
  const b = $('#backBtn');
  if (back) { b.hidden = false; b.href = back; } else b.hidden = true;
  $('#brandLogo').hidden = !!back;
  $('#topRight').innerHTML = right;
  $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}

function entryRowHora(h) {
  const a = atend(h.atendId), m = durMin(h), t = HTIPOS[h.tipo] || HTIPOS.trabalho;
  let extra = '';
  if (h.tipo === 'remoto' && a && h.cobrar !== false) extra = `<small>fat. ${hm(remotoFat(m, ratesOf(a)))}</small>`;
  const ico = h.tipo === 'deslocamento' && h.meio ? MEIOS[h.meio].i : t.i;
  return `<div class="entry" data-act="edit-hora" data-id="${h.id}">
    <div class="ico">${ico}</div>
    <div class="body"><div class="t">${h.inicio}–${h.fim} · ${t.n}${h.tipo === 'deslocamento' && h.meio ? ' (' + MEIOS[h.meio].n + ')' : ''}</div>
      <div class="d">${esc(h.descricao) || '<i>sem descrição</i>'}</div>
      ${h.cobrar === false ? '<span class="badge off">não cobrado</span>' : ''} ${h.feriado ? '<span class="badge warn">feriado</span>' : ''}</div>
    <div class="val">${hm(m)}${extra}</div></div>`;
}
function entryRowDesp(d) {
  const c = CATS[d.categoria] || CATS.outros;
  const noAtt = !(d.fotos && d.fotos.length);
  return `<div class="entry" data-act="edit-desp" data-id="${d.id}">
    <div class="ico">${c.i}</div>
    <div class="body"><div class="t">${c.n}</div><div class="d">${esc(d.descricao) || PAGTOS[d.pagamento] || ''}</div>
      ${d.reembolsavel === false ? '<span class="badge off">não reembolsável</span>' : ''} ${noAtt ? '<span class="badge warn">sem comprovante</span>' : `<span class="badge pago">📎 ${d.fotos.length}</span>`}</div>
    <div class="val">${brl(num(d.valor))}</div></div>`;
}
function entryRowKm(k) {
  return `<div class="entry" data-act="edit-km" data-id="${k.id}">
    <div class="ico">🚗</div>
    <div class="body"><div class="t">${esc(k.origem || '?')} → ${esc(k.destino || '?')}</div><div class="d">${esc(k.obs || '')}</div>
      ${k.cobrar === false ? '<span class="badge off">não cobrado</span>' : ''}</div>
    <div class="val">${numFmt(kmOf(k), 1)} km</div></div>`;
}

/* ----- Início ----- */
function viewHome() {
  setChrome({ title: 'Relatórios', tab: 'home' });
  const mr = monthRange(today());
  const mt = sumCalc(S.atends.map(a => calcAtend(a, mr.from, mr.to).tot));
  const hojeTot = sumCalc(S.atends.map(a => calcAtend(a, today(), today()).tot));
  const open = openAtends();
  const pend = S.despesas.filter(d => d.reembolsavel !== false && !(d.fotos && d.fotos.length) && (atend(d.atendId) || {}).status === 'aberto');
  const receber = S.atends.filter(a => a.status === 'fechado').reduce((s, a) => s + calcAtend(a).tot.liquido, 0);
  const t = S.timer;

  let html = '';
  if (!S.clients.length) {
    html += `<div class="card"><h3>👋 Bem-vindo!</h3><p class="muted small">Comece em 3 passos:</p>
      <ol class="small"><li>Preencha <b>seus dados</b> em Ajustes (saem no relatório)</li><li>Cadastre um <b>cliente</b> com as regras de cobrança</li><li>Crie um <b>atendimento</b> e lance horas e despesas</li></ol>
      <div class="btn-row"><a class="btn ghost" href="#/settings">Meus dados</a><button class="btn" data-act="new-client">+ Cliente</button></div></div>`;
  }
  html += t ? `<div class="card timer"><div class="clock" id="clock">${elapsed(Date.now() - t.start)}</div>
      <div class="info"><b>${HTIPOS[t.tipo].i} ${HTIPOS[t.tipo].n}</b><br>${esc(atend(t.atendId) ? atendLabel(atend(t.atendId)) : '')}</div>
      <button class="btn green" data-act="timer-stop">⏹ Parar</button></div>`
    : `<button class="btn ghost block" style="margin-bottom:12px" data-act="timer-start">▶️ Iniciar cronômetro</button>`;
  html += `<div class="quick">
      <button data-act="new-hora"><span>⏱️</span>Horas</button>
      <button data-act="new-desp"><span>🧾</span>Despesa</button>
      <button data-act="new-km"><span>🚗</span>Km rodado</button></div>`;
  html += `<div class="stats">
      <div class="stat big"><span class="muted small">Faturado em ${monthName(today())}</span><b>${brl(mt.total)}</b></div>
      <div class="stat"><span class="muted small">Hoje</span><b>${brl(hojeTot.total)}</b></div>
      <div class="stat"><span class="muted small">A receber (fechados)</span><b>${brl(receber)}</b></div>
      <div class="stat"><span class="muted small">Horas no mês</span><b>${hm(mt.trabMin + mt.remotoMin)}</b></div>
      <div class="stat"><span class="muted small">Despesas no mês</span><b>${brl(mt.despTotal)}</b></div></div>`;
  if (pend.length) html += `<div class="alert" style="margin-top:12px">📎 ${pend.length} despesa(s) reembolsável(is) sem comprovante em atendimentos abertos.</div>`;
  html += `<h2>Em andamento</h2>`;
  html += open.length ? open.map(atendCard).join('') : `<div class="empty"><span>📁</span>Nenhum atendimento em andamento.<br><br><button class="btn" data-act="new-atend">+ Novo atendimento</button></div>`;
  return html;
}
function atendCard(a) {
  const { tot } = calcAtend(a);
  const tp = ATIPOS[a.tipo] || ATIPOS.viagem;
  const per = a.inicio ? fmtDate(a.inicio) + (a.fim ? ' a ' + fmtDate(a.fim) : '') : '';
  return `<a class="card link" href="#/atend/${a.id}">
    <div class="card-head"><div><h3>${tp.i} ${esc((client(a.clientId) || {}).nome || 'Sem cliente')}</h3>
      <div class="small">${esc(a.titulo)}</div><div class="small muted">${[per, a.cidade, a.os ? 'OS ' + a.os : ''].filter(Boolean).map(esc).join(' · ')}</div></div>
      <span class="badge ${a.status}">${STATUS_CURTO[a.status]}</span></div>
    <div class="card-head" style="margin-top:8px"><span class="small muted">${hm(tot.trabMin + tot.remotoMin)} trab. · ${hm(tot.deslocMin)} desloc. · ${brl(tot.despTotal)} desp.</span><b>${brl(tot.liquido)}</b></div></a>`;
}

/* ----- Atendimentos ----- */
let atendFilter = 'aberto';
function viewAtends() {
  setChrome({ title: 'Atendimentos', tab: 'atends' });
  const list = S.atends.filter(a => atendFilter === 'todos' || a.status === atendFilter).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  const f = { aberto: 'Em andamento', fechado: 'A receber', pago: 'Pagos', todos: 'Todos' };
  return `<div class="filters">${Object.entries(f).map(([k, n]) => `<button class="${k === atendFilter ? 'on' : ''}" data-act="filter-atend" data-f="${k}">${n} (${k === 'todos' ? S.atends.length : S.atends.filter(a => a.status === k).length})</button>`).join('')}</div>
    ${list.length ? list.map(atendCard).join('') : '<div class="empty"><span>📁</span>Nada por aqui.</div>'}
    <button class="fab" data-act="new-atend" aria-label="Novo atendimento">+</button>`;
}

function viewAtend(id) {
  const a = atend(id);
  if (!a) { location.hash = '#/atends'; return ''; }
  const c = client(a.clientId) || {};
  const r = ratesOf(a);
  setChrome({ title: c.nome || 'Atendimento', back: '#/atends', tab: 'atends', right: `<button class="btn sm ghost" data-act="edit-atend" data-id="${a.id}">Editar</button>` });
  const { days, tot } = calcAtend(a);
  const tp = ATIPOS[a.tipo] || ATIPOS.viagem;
  const rows = [
    [`Horas normais (${hm(tot.normalMin)} × ${brl(r.hora)})`, tot.vNormal],
    [`Horas extras (${hm(tot.extraMin)} +${r.extraPct}%)`, tot.vExtra],
    [`Fim de semana/feriado (${hm(tot.fdsMin)} +${r.fdsPct}%)`, tot.vFds],
    [`Suporte remoto (${hm(tot.remotoFatMin)} fat.)`, tot.vRemoto],
    [`Deslocamento (${hm(tot.deslocCobMin)} × ${brl(r.deslocHora)})`, tot.vDesloc],
    [`Km rodado (${numFmt(tot.kmCob, 1)} km)`, tot.vKm],
    [`Despesas reembolsáveis`, tot.despReemb],
  ].filter(x => x[1]);
  let html = `<div class="card">
    <div class="card-head"><div><h3>${tp.i} ${esc(a.titulo)}</h3><div class="small muted">${tp.n}${a.cidade ? ' · ' + esc(a.cidade) : ''}${a.os ? ' · OS ' + esc(a.os) : ''}</div>
      <div class="small muted">${a.inicio ? fmtDate(a.inicio) : ''}${a.fim ? ' a ' + fmtDate(a.fim) : ''}</div></div>
      <span class="badge ${a.status}">${STATUS[a.status]}</span></div></div>
    <div class="quick">
      <button data-act="new-hora" data-atend="${a.id}"><span>⏱️</span>Horas</button>
      <button data-act="new-desp" data-atend="${a.id}"><span>🧾</span>Despesa</button>
      <button data-act="new-km" data-atend="${a.id}"><span>🚗</span>Km</button></div>
    <div class="card"><table class="sumtable">
      ${rows.map(([l, v]) => `<tr><td>${l}</td><td>${brl(v)}</td></tr>`).join('') || '<tr><td class="muted">Nenhum valor lançado ainda</td><td></td></tr>'}
      ${tot.alimGlosa ? `<tr><td class="muted small">Alimentação acima do teto (não cobrada)</td><td class="muted">${brl(tot.alimGlosa)}</td></tr>` : ''}
      ${tot.adiant ? `<tr><td>(−) Adiantamento</td><td>−${brl(tot.adiant)}</td></tr>` : ''}
      <tr class="total"><td><b>Total a receber</b></td><td>${brl(tot.liquido)}</td></tr></table>
      ${r.hora === 0 && r.remotoHora === 0 ? '<p class="alert" style="margin:10px 0 0">Defina o valor da hora no cadastro do cliente para calcular os valores.</p>' : ''}</div>
    <div class="btn-row" style="margin-bottom:8px">
      <button class="btn" data-act="report-atend" data-id="${a.id}">📄 Relatório completo</button>
      <button class="btn ghost" data-act="sign" data-id="${a.id}">✍️ ${a.assinatura ? 'Assinado' : 'Assinatura'}</button></div>
    <div class="btn-row">
      ${a.status === 'aberto' ? `<button class="btn ghost sm" data-act="set-status" data-id="${a.id}" data-s="fechado">✅ Encerrar atendimento</button>` : ''}
      ${a.status === 'fechado' ? `<button class="btn ghost sm" data-act="set-status" data-id="${a.id}" data-s="pago">💰 Marcar como pago</button>` : ''}
      ${a.status !== 'aberto' ? `<button class="btn ghost sm" data-act="set-status" data-id="${a.id}" data-s="aberto">↩️ Reabrir</button>` : ''}
      <button class="btn ghost sm" data-act="share-atend" data-id="${a.id}">📤 Resumo p/ WhatsApp</button></div>`;
  if (!days.length) html += `<div class="empty"><span>🗓️</span>Nenhum lançamento ainda.<br>Use os botões acima para lançar horas, despesas ou km.</div>`;
  days.slice().reverse().forEach(({ date, c: dc }) => {
    const { hs, ds, ks } = dayEntries(a.id, date);
    html += `<div class="day"><div class="day-head"><h3>${WDL[dateObj(date).getDay()]}, ${fmtDate(date)}</h3>
      <div><b>${brl(dc.total)}</b> <button class="btn sm ghost" data-act="report-day" data-id="${a.id}" data-date="${date}">📄 Dia</button></div></div>
      ${hs.map(entryRowHora).join('')}${ks.map(entryRowKm).join('')}${ds.map(entryRowDesp).join('')}
      <div class="btn-row"><button class="btn sm ghost" data-act="new-hora" data-atend="${a.id}" data-date="${date}">+ Horas</button>
      <button class="btn sm ghost" data-act="new-desp" data-atend="${a.id}" data-date="${date}">+ Despesa</button></div></div>`;
  });
  return html;
}

/* ----- Clientes ----- */
function viewClients() {
  setChrome({ title: 'Clientes', tab: 'clients' });
  const list = S.clients.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  return (list.length ? list.map(c => {
    const r = { ...defaultRates(), ...c.rates };
    const n = S.atends.filter(a => a.clientId === c.id).length;
    const tags = [r.hora ? `Hora ${brl(r.hora)}` : '', r.remotoHora ? `Remoto ${brl(r.remotoHora)}` : '', r.cobraDesloc ? `Desloc. ${brl(r.deslocHora)}` : '', r.kmValor ? `Km ${brl(r.kmValor)}` : ''].filter(Boolean);
    return `<div class="card link" data-act="edit-client" data-id="${c.id}" style="cursor:pointer">
      <div class="card-head"><div><h3>${esc(c.nome)}</h3><div class="small muted">${[c.cidade, c.contato, c.telefone].filter(Boolean).map(esc).join(' · ')}</div></div>
      <span class="small muted">${n} atend.</span></div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${tags.map(t => `<span class="badge aberto">${t}</span>`).join('') || '<span class="badge warn">valores não definidos</span>'}</div>
      <div class="btn-row" style="margin-top:10px"><button class="btn sm ghost" data-act="new-atend" data-client="${c.id}">+ Atendimento</button></div></div>`;
  }).join('') : '<div class="empty"><span>👥</span>Nenhum cliente cadastrado.<br>Toque em + para cadastrar e definir as regras de cobrança.</div>')
    + '<button class="fab" data-act="new-client" aria-label="Novo cliente">+</button>';
}

/* ----- Relatórios ----- */
let repFilter = null;
function viewReports() {
  setChrome({ title: 'Relatórios', tab: 'reports' });
  if (!repFilter) repFilter = { ...monthRange(today()), clientId: '', detalhe: true };
  const f = repFilter;
  const data = periodData(f);
  const byClient = {};
  data.forEach(x => { (byClient[x.a.clientId] = byClient[x.a.clientId] || []).push(x); });
  return `<div class="card">
      <label>Cliente<select id="rfClient"><option value="">Todos os clientes</option>${S.clients.map(c => `<option value="${c.id}" ${c.id === f.clientId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <div class="row2"><label>De<input type="date" id="rfFrom" value="${f.from}"></label><label>Até<input type="date" id="rfTo" value="${f.to}"></label></div>
      <div class="filters">
        <button data-act="rf-preset" data-p="mes">Este mês</button><button data-act="rf-preset" data-p="mesant">Mês passado</button>
        <button data-act="rf-preset" data-p="sem">Últimos 7 dias</button><button data-act="rf-preset" data-p="ano">Este ano</button></div>
      <label class="check"><input type="checkbox" id="rfDet" ${f.detalhe ? 'checked' : ''}> Incluir detalhamento dia a dia no PDF</label>
    </div>
    <div class="stats">
      <div class="stat big"><span class="muted small">Total no período</span><b>${brl(sumCalc(data.map(x => x.tot)).total)}</b></div>
      <div class="stat"><span class="muted small">Horas trabalhadas</span><b>${hm(sumCalc(data.map(x => x.tot)).trabMin)}</b></div>
      <div class="stat"><span class="muted small">Suporte remoto</span><b>${hm(sumCalc(data.map(x => x.tot)).remotoMin)}</b></div>
      <div class="stat"><span class="muted small">Deslocamento</span><b>${hm(sumCalc(data.map(x => x.tot)).deslocMin)}</b></div>
      <div class="stat"><span class="muted small">Despesas</span><b>${brl(sumCalc(data.map(x => x.tot)).despTotal)}</b></div></div>
    <div class="btn-row" style="margin:12px 0">
      <button class="btn" data-act="report-period">📄 Gerar PDF</button>
      <button class="btn ghost" data-act="csv-period">📊 Exportar Excel (CSV)</button></div>
    ${Object.entries(byClient).map(([cid, arr]) => `<h2>${esc((client(cid) || {}).nome || 'Sem cliente')} — ${brl(sumCalc(arr.map(x => x.tot)).total)}</h2>
      ${arr.map(x => `<a class="card link" href="#/atend/${x.a.id}"><div class="card-head"><div><b>${esc(x.a.titulo)}</b><div class="small muted">${x.days.length} dia(s) · ${hm(x.tot.trabMin + x.tot.remotoMin)} · ${STATUS[x.a.status]}</div></div><b>${brl(x.tot.total)}</b></div></a>`).join('')}`).join('')
    || '<div class="empty"><span>📊</span>Nenhum lançamento no período.</div>'}`;
}
function periodData(f) {
  return S.atends.filter(a => !f.clientId || a.clientId === f.clientId)
    .map(a => ({ a, ...calcAtend(a, f.from, f.to) })).filter(x => x.days.length)
    .sort((x, y) => (x.a.inicio || '').localeCompare(y.a.inicio || ''));
}

/* ----- Ajustes ----- */
function viewSettings() {
  setChrome({ title: 'Ajustes', tab: 'settings' });
  const s = S.settings;
  return `<div class="card"><h3>👤 Meus dados (saem no relatório)</h3>
      <form id="meForm">
        <label>Nome / Razão social<input name="nome" value="${esc(s.nome)}"></label>
        <div class="row2"><label>CPF / CNPJ<input name="documento" value="${esc(s.documento)}"></label><label>Telefone<input name="telefone" type="tel" value="${esc(s.telefone)}"></label></div>
        <label>E-mail<input name="email" type="email" value="${esc(s.email)}"></label>
        <label>Cidade / UF<input name="cidade" value="${esc(s.cidade)}"></label>
        <label>Chave PIX<input name="pix" value="${esc(s.pix)}"></label>
        <label>Dados bancários<textarea name="banco" rows="2" placeholder="Banco, agência, conta">${esc(s.banco)}</textarea></label>
        <label>Texto de rodapé do relatório<input name="rodape" value="${esc(s.rodape)}" placeholder="Ex.: Pagamento em até 15 dias"></label>
        <label class="lbl">Logotipo</label>
        <div class="thumbs">${s.logo ? `<div class="thumb"><img src="${s.logo}"><button type="button" data-act="logo-rm">✕</button></div>` : ''}</div>
        <div class="attach-btns"><label><input type="file" accept="image/*" id="logoIn"><span>🖼️ ${s.logo ? 'Trocar' : 'Enviar'} logotipo</span></label></div>
        <button class="btn block" type="submit">Salvar meus dados</button>
      </form></div>
    <div class="card"><h3>🎨 Aparência</h3>
      <div class="filters">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, n]) => `<button class="${(s.theme || 'auto') === k ? 'on' : ''}" data-act="theme" data-t="${k}">${n}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="optFotos" ${s.semFotos ? '' : 'checked'}> Anexar fotos dos comprovantes no relatório</label></div>
    <div class="card"><h3>💾 Backup</h3>
      <p class="small muted">Seus dados ficam apenas neste aparelho. Faça backup com frequência e guarde o arquivo (Google Drive, e-mail, WhatsApp).
      ${s.lastBackup ? `<br>Último backup: <b>${new Date(s.lastBackup).toLocaleString('pt-BR')}</b>` : '<br><b>Nenhum backup feito ainda.</b>'}</p>
      <div class="btn-row"><button class="btn" data-act="backup-export">⬇️ Fazer backup</button>
      <label class="btn ghost" style="margin:0">⬆️ Restaurar<input type="file" accept=".json,application/json" id="restoreIn" hidden></label></div>
      <p class="small muted" id="storageInfo"></p></div>
    <div class="card"><h3>⚠️ Zona de perigo</h3><button class="btn danger block" data-act="wipe">Apagar todos os dados</button></div>
    <p class="small muted" style="text-align:center">HS Systems · Relatórios v${APP_VERSION} · funciona offline</p>`;
}
function mountSettings() {
  const form = $('#meForm');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    new FormData(form).forEach((v, k) => { S.settings[k] = v; });
    await saveSettings(); toast('Dados salvos');
  });
  $('#logoIn').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    S.settings.logo = await compressImage(f, 500, 0.85);
    await saveSettings(); render();
  });
  $('#optFotos').addEventListener('change', async e => { S.settings.semFotos = !e.target.checked; await saveSettings(); });
  $('#restoreIn').addEventListener('change', e => restoreBackup(e.target.files[0]));
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(est => {
    const el = $('#storageInfo'); if (el) el.textContent = `Espaço usado: ${(est.usage / 1048576).toFixed(1)} MB`;
  });
}
function mountReports() {
  const upd = () => {
    repFilter = { clientId: $('#rfClient').value, from: $('#rfFrom').value, to: $('#rfTo').value, detalhe: $('#rfDet').checked };
    render();
  };
  ['#rfClient', '#rfFrom', '#rfTo', '#rfDet'].forEach(s => { const el = $(s); if (el) el.addEventListener('change', upd); });
}

/* =========================================================
   Relatórios (HTML para impressão / PDF)
   ========================================================= */
function repHeader(title, sub) {
  const s = S.settings;
  return `<div class="rep-head">
      <div>${s.logo ? `<img src="${s.logo}">` : `<h1>${esc(s.nome || 'Relatório técnico')}</h1>`}</div>
      <div class="me">${s.logo && s.nome ? `<b>${esc(s.nome)}</b><br>` : ''}${[s.documento, s.telefone, s.email, s.cidade].filter(Boolean).map(esc).join('<br>')}</div></div>
    <div class="rep-title"><h1>${esc(title)}</h1><div class="sub">${sub}</div></div>`;
}
function repClientBox(c, a) {
  const tp = ATIPOS[a.tipo] || ATIPOS.viagem;
  return `<div class="rep-grid" style="margin-top:10px">
    <div class="rep-box"><b>Cliente</b><strong>${esc(c.nome || '')}</strong><br>${[c.documento, c.endereco, c.cidade, c.contato, c.telefone, c.email].filter(Boolean).map(esc).join('<br>')}</div>
    <div class="rep-box"><b>Atendimento</b><strong>${esc(a.titulo)}</strong><br>Tipo: ${tp.n}${a.cidade ? '<br>Local: ' + esc(a.cidade) : ''}${a.os ? '<br>Chamado/OS: ' + esc(a.os) : ''}
      <br>Período: ${fmtDate(a.inicio)}${a.fim ? ' a ' + fmtDate(a.fim) : ''}</div></div>`;
}
function repSummary(a, tot, withAdiant) {
  const r = ratesOf(a);
  const rows = [
    ['Horas normais', hdec(tot.normalMin), brl(r.hora), tot.vNormal],
    [`Horas extras (+${numFmt(r.extraPct, 0)}%)`, hdec(tot.extraMin), brl(r.hora * (1 + r.extraPct / 100)), tot.vExtra],
    [`Horas sáb/dom/feriado (+${numFmt(r.fdsPct, 0)}%)`, hdec(tot.fdsMin), brl(r.hora * (1 + r.fdsPct / 100)), tot.vFds],
    ['Suporte remoto (faturado)', hdec(tot.remotoFatMin), brl(r.remotoHora), tot.vRemoto],
    ['Horas de deslocamento', hdec(tot.deslocCobMin), brl(r.deslocHora), tot.vDesloc],
    ['Km rodado (carro próprio)', numFmt(tot.kmCob, 1) + ' km', brl(r.kmValor), tot.vKm],
    ['Despesas reembolsáveis', '', '', tot.despReemb],
  ].filter(x => x[3]);
  return `<table><thead><tr><th>Item</th><th class="n">Qtd. (h)</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${x[0]}</td><td class="n">${x[1]}</td><td class="n">${x[2]}</td><td class="n">${brl(x[3])}</td></tr>`).join('') || '<tr><td colspan="4">Sem valores.</td></tr>'}
    <tr class="tot"><td colspan="3">Subtotal</td><td class="n">${brl(tot.total)}</td></tr>
    ${withAdiant && tot.adiant ? `<tr><td colspan="3">(−) Adiantamento recebido</td><td class="n">−${brl(tot.adiant)}</td></tr>` : ''}
    <tr class="grand"><td colspan="3">TOTAL A RECEBER</td><td class="n">${brl(withAdiant ? tot.liquido : tot.total)}</td></tr></tbody></table>
    <p class="small" style="color:#4b5563">Tempo total: trabalho ${hm(tot.trabMin)} · remoto ${hm(tot.remotoMin)} · deslocamento ${hm(tot.deslocMin)}${tot.naoCobMin ? ` · não cobrado ${hm(tot.naoCobMin)}` : ''}.
    Despesas totais ${brl(tot.despTotal)}${tot.despTotal - tot.despReemb - tot.alimGlosa > 0.001 ? ` (não reembolsáveis: ${brl(tot.despTotal - tot.despReemb - tot.alimGlosa)})` : ''}${tot.alimGlosa ? ` · alimentação acima do teto diário: ${brl(tot.alimGlosa)}` : ''}.</p>`;
}
function repDay(a, date, dc) {
  const { hs, ds, ks } = dayEntries(a.id, date);
  const r = ratesOf(a);
  let h = `<div class="rep-day"><div class="rep-day-h"><span>${WDL[dateObj(date).getDay()]}, ${fmtDate(date)}</span><span>${brl(dc.total)}</span></div>`;
  if (hs.length) h += `<h3>Horas</h3><table><thead><tr><th>Horário</th><th>Tipo</th><th>Atividade</th><th class="n">Duração</th></tr></thead><tbody>
    ${hs.map(x => {
      const m = durMin(x); const t = HTIPOS[x.tipo] || HTIPOS.trabalho;
      let dur = hm(m);
      if (x.tipo === 'remoto' && x.cobrar !== false) dur += `<br><small>fat. ${hm(remotoFat(m, r))}</small>`;
      return `<tr><td>${x.inicio}–${x.fim}${num(x.intervalo) ? `<br><small>pausa ${num(x.intervalo)} min</small>` : ''}</td>
        <td>${t.n}${x.tipo === 'deslocamento' && x.meio ? ' (' + MEIOS[x.meio].n + ')' : ''}${x.cobrar === false ? '<br><small>(não cobrado)</small>' : ''}${x.feriado ? '<br><small>(feriado)</small>' : ''}</td>
        <td class="desc">${esc(x.descricao)}</td><td class="n">${dur}</td></tr>`;
    }).join('')}</tbody></table>`;
  if (ks.length) h += `<h3>Deslocamento com carro próprio</h3><table><thead><tr><th>Trajeto</th><th>Km inicial → final</th><th class="n">Km</th><th class="n">Valor</th></tr></thead><tbody>
    ${ks.map(k => `<tr><td>${esc(k.origem)} → ${esc(k.destino)}${k.obs ? '<br><small>' + esc(k.obs) + '</small>' : ''}</td><td>${k.kmInicial ? esc(k.kmInicial) + ' → ' + esc(k.kmFinal) : '—'}</td>
      <td class="n">${numFmt(kmOf(k), 1)}</td><td class="n">${k.cobrar === false ? 'não cobrado' : brl(kmOf(k) * r.kmValor)}</td></tr>`).join('')}</tbody></table>`;
  if (ds.length) h += `<h3>Despesas</h3><table><thead><tr><th>Categoria</th><th>Descrição</th><th>Pagamento</th><th class="n">Valor</th><th>Reemb.</th></tr></thead><tbody>
    ${ds.map(d => `<tr><td>${(CATS[d.categoria] || CATS.outros).n}</td><td>${esc(d.descricao)}${d.nota ? '<br><small>Nota ' + esc(d.nota) + '</small>' : ''}${d.fotos && d.fotos.length ? ' <small>📎</small>' : ''}</td>
      <td>${PAGTOS[d.pagamento] || ''}</td><td class="n">${brl(num(d.valor))}</td><td>${d.reembolsavel === false ? 'Não' : 'Sim'}</td></tr>`).join('')}
    ${dc.alimGlosa ? `<tr class="sub"><td colspan="3">Alimentação acima do teto diário (não cobrada)</td><td class="n">−${brl(dc.alimGlosa)}</td><td></td></tr>` : ''}</tbody></table>`;
  return h + '</div>';
}
function repSigs(a) {
  const s = S.settings, sig = a.assinatura;
  return `<div class="sigs">
    <div class="sig"><div class="line">${esc(s.nome || 'Técnico responsável')}<br><small>Técnico</small></div></div>
    <div class="sig">${sig ? `<img src="${sig.img}"><div class="line withimg" style="margin-top:0">${esc(sig.nome)}${sig.cargo ? ' — ' + esc(sig.cargo) : ''}<br><small>Assinado em ${new Date(sig.data).toLocaleString('pt-BR')}</small></div>`
      : `<div class="line">${esc((client(a.clientId) || {}).contato || 'Responsável pelo cliente')}<br><small>Cliente</small></div>`}</div></div>`;
}
function repPayment() {
  const s = S.settings;
  if (!s.pix && !s.banco && !s.rodape) return '';
  return `<h2>Dados para pagamento</h2><p>${s.pix ? '<b>PIX:</b> ' + esc(s.pix) + '<br>' : ''}${s.banco ? esc(s.banco).replace(/\n/g, '<br>') + '<br>' : ''}${s.rodape ? esc(s.rodape) : ''}</p>`;
}
async function repAttachments(a, dates) {
  if (S.settings.semFotos) return '';
  const items = [];
  S.despesas.filter(d => d.atendId === a.id && dates.includes(d.data)).sort((x, y) => x.data.localeCompare(y.data))
    .forEach(d => (d.fotos || []).forEach(f => items.push({ f, cap: `${fmtDate(d.data)} · ${(CATS[d.categoria] || CATS.outros).n} · ${esc(d.descricao)} · ${brl(num(d.valor))}` })));
  S.kms.filter(k => k.atendId === a.id && dates.includes(k.data))
    .forEach(k => (k.fotos || []).forEach(f => items.push({ f, cap: `${fmtDate(k.data)} · Painel km · ${esc(k.origem)} → ${esc(k.destino)}` })));
  if (!items.length) return '';
  let h = `<div class="anexos"><h2>Anexos — comprovantes (${items.length})</h2>`;
  let i = 0;
  for (const it of items) {
    const f = await getFile(it.f); if (!f) continue;
    i++;
    h += `<div class="anexo"><b>Anexo ${i}</b> — ${it.cap}${f.type.startsWith('image') ? `<img src="${f.data}">` : `<br><i>Arquivo PDF anexado: ${esc(f.name)} (enviar separadamente)</i>`}</div>`;
  }
  return h + '</div>';
}
async function reportAtend(a, date) {
  const c = client(a.clientId) || {};
  const { days, tot } = date ? calcAtend(a, date, date) : calcAtend(a);
  const title = date ? 'Relatório Diário de Atendimento' : 'Relatório de Atendimento Técnico';
  const sub = date ? `${WDL[dateObj(date).getDay()]}, ${fmtDate(date)}` : `${fmtDate(a.inicio)}${a.fim ? ' a ' + fmtDate(a.fim) : ''}`;
  let h = repHeader(title, sub) + repClientBox(c, a);
  if (a.obs && !date) h += `<h2>Resumo do atendimento</h2><p class="desc">${esc(a.obs)}</p>`;
  h += `<h2>Resumo financeiro</h2>` + repSummary(a, tot, !date);
  h += `<h2>Detalhamento ${date ? 'do dia' : 'por dia'}</h2>` + (days.map(d => repDay(a, d.date, d.c)).join('') || '<p>Sem lançamentos.</p>');
  h += repPayment() + repSigs(a);
  h += `<div class="foot-note">Gerado em ${new Date().toLocaleString('pt-BR')} · HS Systems Relatórios</div>`;
  h += await repAttachments(a, days.map(d => d.date));
  const fname = `Relatorio_${(c.nome || 'cliente').replace(/[^\w]+/g, '_')}_${date || a.inicio || today()}`;
  showReport(h, fname);
}
function reportPeriod() {
  const f = repFilter, data = periodData(f);
  const s = f.clientId ? client(f.clientId) : null;
  let h = repHeader('Relatório de Horas e Despesas', `${fmtDate(f.from)} a ${fmtDate(f.to)}${s ? ' · ' + esc(s.nome) : ''}`);
  if (s) h += `<div class="rep-box" style="margin-top:10px"><b>Cliente</b><strong>${esc(s.nome)}</strong><br>${[s.documento, s.endereco, s.cidade, s.contato].filter(Boolean).map(esc).join(' · ')}</div>`;
  h += `<h2>Resumo por atendimento</h2><table><thead><tr><th>Cliente / atendimento</th><th class="n">Dias</th><th class="n">Trab.</th><th class="n">Remoto</th><th class="n">Desloc.</th><th class="n">Despesas</th><th class="n">Total</th></tr></thead><tbody>
    ${data.map(x => `<tr><td><b>${esc((client(x.a.clientId) || {}).nome || '')}</b><br>${esc(x.a.titulo)}${x.a.os ? ' · OS ' + esc(x.a.os) : ''}</td><td class="n">${x.days.length}</td><td class="n">${hm(x.tot.trabMin)}</td>
      <td class="n">${hm(x.tot.remotoMin)}</td><td class="n">${hm(x.tot.deslocMin)}</td><td class="n">${brl(x.tot.despReemb)}</td><td class="n">${brl(x.tot.total)}</td></tr>`).join('')}
    ${(() => { const t = sumCalc(data.map(x => x.tot)); return `<tr class="grand"><td>TOTAL</td><td class="n">${data.reduce((n, x) => n + x.days.length, 0)}</td><td class="n">${hm(t.trabMin)}</td><td class="n">${hm(t.remotoMin)}</td><td class="n">${hm(t.deslocMin)}</td><td class="n">${brl(t.despReemb)}</td><td class="n">${brl(t.total)}</td></tr>`; })()}
    </tbody></table>`;
  if (f.detalhe) data.forEach(x => {
    h += `<h2>${esc((client(x.a.clientId) || {}).nome || '')} — ${esc(x.a.titulo)}</h2>` + repSummary(x.a, x.tot, false) + x.days.map(d => repDay(x.a, d.date, d.c)).join('');
  });
  h += repPayment() + `<div class="foot-note">Gerado em ${new Date().toLocaleString('pt-BR')} · HS Systems Relatórios</div>`;
  showReport(h, `Relatorio_${f.from}_a_${f.to}`);
}
function showReport(html, fname) {
  const el = $('#report');
  el.innerHTML = `<div class="rep-bar"><button class="btn ghost" data-act="close-report">✕ Fechar</button><button class="btn" data-act="print">🖨️ Salvar PDF / Imprimir</button></div>
    <div class="paper">${html}</div>`;
  el.classList.remove('hidden');
  el.scrollTop = 0;
  el.dataset.fname = fname;
  document.body.style.overflow = 'hidden';
}
function printReport() {
  const old = document.title;
  document.title = $('#report').dataset.fname || old; // nome sugerido do PDF
  window.print();
  setTimeout(() => { document.title = old; }, 1500);
}
function shareAtend(a) {
  const c = client(a.clientId) || {}, { tot } = calcAtend(a), r = ratesOf(a);
  const L = [`*Relatório de atendimento — ${c.nome}*`, a.titulo, `Período: ${fmtDate(a.inicio)}${a.fim ? ' a ' + fmtDate(a.fim) : ''}`, ''];
  if (tot.vNormal) L.push(`Horas normais: ${hm(tot.normalMin)} = ${brl(tot.vNormal)}`);
  if (tot.vExtra) L.push(`Horas extras: ${hm(tot.extraMin)} = ${brl(tot.vExtra)}`);
  if (tot.vFds) L.push(`Fim de semana/feriado: ${hm(tot.fdsMin)} = ${brl(tot.vFds)}`);
  if (tot.vRemoto) L.push(`Suporte remoto: ${hm(tot.remotoFatMin)} = ${brl(tot.vRemoto)}`);
  if (tot.vDesloc) L.push(`Deslocamento: ${hm(tot.deslocCobMin)} = ${brl(tot.vDesloc)}`);
  if (tot.vKm) L.push(`Km rodado: ${numFmt(tot.kmCob, 1)} km × ${brl(r.kmValor)} = ${brl(tot.vKm)}`);
  if (tot.despReemb) L.push(`Despesas: ${brl(tot.despReemb)}`);
  if (tot.adiant) L.push(`(−) Adiantamento: ${brl(tot.adiant)}`);
  L.push('', `*Total: ${brl(tot.liquido)}*`);
  if (S.settings.pix) L.push(`PIX: ${S.settings.pix}`);
  const text = L.join('\n');
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else navigator.clipboard.writeText(text).then(() => toast('Resumo copiado'));
}

/* ---------- CSV ---------- */
function csvPeriod() {
  const f = repFilter;
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const n = v => numFmt(v);
  const rows = [['Registro', 'Data', 'Dia', 'Cliente', 'Atendimento', 'OS', 'Tipo/Categoria', 'Detalhe', 'Início', 'Fim', 'Horas', 'Horas faturadas', 'Km', 'Valor', 'Cobrar/Reemb.', 'Descrição']];
  const inR = d => d >= f.from && d <= f.to;
  S.atends.filter(a => !f.clientId || a.clientId === f.clientId).forEach(a => {
    const cn = (client(a.clientId) || {}).nome || '', r = ratesOf(a);
    S.horas.filter(h => h.atendId === a.id && inR(h.data)).forEach(h => {
      const m = durMin(h), fat = h.tipo === 'remoto' ? remotoFat(m, r) : m;
      rows.push(['Horas', fmtDate(h.data), weekday(h.data), cn, a.titulo, a.os, HTIPOS[h.tipo].n, h.meio ? MEIOS[h.meio].n : '', h.inicio, h.fim, n(m / 60), n(h.cobrar === false ? 0 : fat / 60), '', '', h.cobrar === false ? 'Não' : 'Sim', h.descricao]);
    });
    S.kms.filter(k => k.atendId === a.id && inR(k.data)).forEach(k => rows.push(['Km', fmtDate(k.data), weekday(k.data), cn, a.titulo, a.os, 'Carro próprio', `${k.origem} → ${k.destino}`, '', '', '', '', n(kmOf(k)), n(kmOf(k) * r.kmValor), k.cobrar === false ? 'Não' : 'Sim', k.obs]));
    S.despesas.filter(d => d.atendId === a.id && inR(d.data)).forEach(d => rows.push(['Despesa', fmtDate(d.data), weekday(d.data), cn, a.titulo, a.os, (CATS[d.categoria] || CATS.outros).n, PAGTOS[d.pagamento] || '', '', '', '', '', '', n(num(d.valor)), d.reembolsavel === false ? 'Não' : 'Sim', d.descricao]));
  });
  rows.push([]);
  rows.push(['Resumo por atendimento']);
  rows.push(['Cliente', 'Atendimento', 'Horas normais', 'Horas extras', 'Horas fds/feriado', 'Remoto faturado', 'Deslocamento cobrado', 'Km', 'Valor horas', 'Valor km', 'Despesas reemb.', 'Total']);
  periodData(f).forEach(x => rows.push([(client(x.a.clientId) || {}).nome, x.a.titulo, n(x.tot.normalMin / 60), n(x.tot.extraMin / 60), n(x.tot.fdsMin / 60), n(x.tot.remotoFatMin / 60), n(x.tot.deslocCobMin / 60), n(x.tot.kmCob), n(x.tot.vHoras), n(x.tot.vKm), n(x.tot.despReemb), n(x.tot.total)]));
  const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `lancamentos_${f.from}_a_${f.to}.csv`);
}

/* ---------- Backup ---------- */
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function backupExport() {
  toast('Gerando backup…');
  const data = {};
  for (const s of ['clients', 'atends', 'horas', 'despesas', 'kms', 'files']) data[s] = await dbAll(s);
  S.settings.lastBackup = new Date().toISOString();
  await saveSettings();
  data.settings = S.settings;
  const payload = { app: 'relatorios-campo', version: 1, appVersion: APP_VERSION, exportedAt: S.settings.lastBackup, data };
  const name = `backup-relatorios-${today()}.json`;
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && confirm('Compartilhar o backup (Drive, WhatsApp, e-mail)?\n\nCancelar = apenas baixar o arquivo.')) {
    try { await navigator.share({ files: [file], title: 'Backup Relatórios de Campo' }); render(); return; } catch (e) { if (e.name === 'AbortError') { render(); return; } }
  }
  downloadBlob(blob, name);
  render();
  toast('Backup salvo em Downloads');
}
async function restoreBackup(file) {
  if (!file) return;
  try {
    const p = JSON.parse(await file.text());
    if (p.app !== 'relatorios-campo' || !p.data) throw new Error('Arquivo não é um backup deste app');
    const d = p.data;
    const cnt = `${(d.clients || []).length} clientes, ${(d.atends || []).length} atendimentos, ${(d.horas || []).length} lançamentos de horas, ${(d.despesas || []).length} despesas`;
    if (!confirm(`Restaurar backup de ${new Date(p.exportedAt).toLocaleString('pt-BR')}?\n\n${cnt}\n\nTODOS os dados atuais deste aparelho serão substituídos.`)) return;
    for (const s of ['clients', 'atends', 'horas', 'despesas', 'kms', 'files']) {
      await dbClear(s);
      for (const o of d[s] || []) await dbPut(s, o);
    }
    if (d.settings) await dbPut('kv', { ...d.settings, id: 'settings' });
    fileCache.clear();
    await loadAll();
    applyTheme(); render(); toast('Backup restaurado!');
  } catch (e) { alert('Não foi possível restaurar: ' + e.message); }
}
async function wipeAll() {
  if (!confirm('Apagar TODOS os dados deste aparelho?\nIsso não pode ser desfeito. Faça um backup antes.')) return;
  if (prompt('Digite APAGAR para confirmar') !== 'APAGAR') return;
  for (const s of STORES) await dbClear(s);
  fileCache.clear(); await loadAll(); applyTheme(); location.hash = '#/'; render(); toast('Dados apagados');
}

function applyTheme() {
  const t = S.settings.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* =========================================================
   Roteamento e eventos
   ========================================================= */
function render() {
  const [p, id] = (location.hash.slice(2) || '').split('/');
  const app = $('#app');
  const views = { '': viewHome, atends: viewAtends, atend: () => viewAtend(id), clients: viewClients, reports: viewReports, settings: viewSettings };
  app.innerHTML = (views[p] || viewHome)();
  if (p === 'settings') mountSettings();
  if (p === 'reports') mountReports();
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

const actions = {
  'close-sheet': () => closeSheet(),
  'close-report': () => { $('#report').classList.add('hidden'); $('#report').innerHTML = ''; document.body.style.overflow = ''; },
  'print': () => printReport(),
  'new-client': () => clientForm(),
  'edit-client': d => clientForm(client(d.id)),
  'new-atend': d => atendForm(null, { clientId: d.client }),
  'edit-atend': d => atendForm(atend(d.id)),
  'filter-atend': d => { atendFilter = d.f; render(); },
  'set-status': async d => { const a = atend(d.id); a.status = d.s; if (d.s === 'fechado' && !a.fim) a.fim = datesOf(a.id).pop() || today(); await save('atends', a); render(); toast(STATUS[d.s]); },
  'new-hora': d => horaForm(null, { atendId: d.atend, data: d.date }),
  'edit-hora': d => horaForm(S.horas.find(x => x.id === d.id)),
  'new-desp': d => despForm(null, { atendId: d.atend, data: d.date }),
  'edit-desp': d => despForm(S.despesas.find(x => x.id === d.id)),
  'new-km': d => kmForm(null, { atendId: d.atend, data: d.date }),
  'edit-km': d => kmForm(S.kms.find(x => x.id === d.id)),
  'report-atend': d => reportAtend(atend(d.id)),
  'report-day': d => reportAtend(atend(d.id), d.date),
  'share-atend': d => shareAtend(atend(d.id)),
  'sign': d => signForm(atend(d.id)),
  'timer-start': () => timerStart(),
  'timer-stop': () => timerStop(),
  'report-period': () => reportPeriod(),
  'csv-period': () => csvPeriod(),
  'rf-preset': d => {
    const t = new Date();
    if (d.p === 'mes') Object.assign(repFilter, monthRange(today()));
    if (d.p === 'mesant') Object.assign(repFilter, monthRange(isoDate(new Date(t.getFullYear(), t.getMonth() - 1, 1))));
    if (d.p === 'sem') Object.assign(repFilter, { from: isoDate(new Date(t.getTime() - 6 * 864e5)), to: today() });
    if (d.p === 'ano') Object.assign(repFilter, { from: t.getFullYear() + '-01-01', to: t.getFullYear() + '-12-31' });
    render();
  },
  'backup-export': () => backupExport(),
  'wipe': () => wipeAll(),
  'theme': async d => { S.settings.theme = d.t; await saveSettings(); applyTheme(); render(); },
  'logo-rm': async () => { delete S.settings.logo; await saveSettings(); render(); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

/* ---------- Inicialização ---------- */
(async function init() {
  try {
    await openDB();
    await loadAll();
    applyTheme();
    render();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><h3>Erro ao abrir o banco de dados</h3><p>${esc(e.message)}</p></div>`;
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
