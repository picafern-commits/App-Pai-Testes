
const firebaseConfig = {
  apiKey: "AIzaSyD2nCoO5TP56H_gm5SBWM6DLf_SZW1UPxI",
  authDomain: "app-gestao-c932d.firebaseapp.com",
  projectId: "app-gestao-c932d",
  storageBucket: "app-gestao-c932d.firebasestorage.app",
  messagingSenderId: "318015040210",
  appId: "1:318015040210:web:e3070e6b8f4d74a8799b0b"
};


import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const APP_VERSION = '1.0.6';
const STORAGE_KEYS = { trabalhos:'ge_trabalhos', clientes:'ge_clientes', pagamentos:'ge_pagamentos' , lastTrabId:'ge_last_trab_id' };

let currentRole = null, currentUsername = null, currentUserEmail = null, currentUserUid = null;
let trabalhos = [], clientes = [], pagamentos = [];
let lastTrabId = 0;

let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let syncReady = false;
let syncMessage = 'Local';
let unsubs = [];

let presenceSessionId = null;
let presenceHeartbeatId = null;
let presenceRefreshId = null;
let onlineUsersUnsub = null;
let onlineUsersCache = [];
let currentPresencePage = 'Dashboard';
const PRESENCE_COLLECTION = 'onlineUsers';
const PRESENCE_HEARTBEAT_MS = 15000;
const PRESENCE_IDLE_MS = 45000;
const PRESENCE_OFFLINE_MS = 90000;

function ensurePresenceSessionId(){
  let sid = localStorage.getItem('ge_presence_session_id');
  if(!sid){
    sid = (globalThis.crypto?.randomUUID?.() || `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`);
    localStorage.setItem('ge_presence_session_id', sid);
  }
  presenceSessionId = sid;
  return sid;
}
function getPresenceDeviceType(){
  const ua = navigator.userAgent || '';
  if(/ipad|tablet/i.test(ua)) return 'Tablet';
  if(/mobi|android|iphone/i.test(ua)) return 'Mobile';
  return 'PC';
}
function getOnlinePresenceStatus(lastSeenValue, explicitOnline=true){
  if(!explicitOnline) return 'offline';
  const millis = lastSeenValue?.toDate ? lastSeenValue.toDate().getTime() : (lastSeenValue?.seconds ? lastSeenValue.seconds * 1000 : (lastSeenValue ? new Date(lastSeenValue).getTime() : 0));
  if(!millis) return 'offline';
  const age = Date.now() - millis;
  if(age <= PRESENCE_IDLE_MS) return 'online';
  if(age <= PRESENCE_OFFLINE_MS) return 'idle';
  return 'offline';
}
function formatPresenceLastSeen(lastSeenValue){
  const dt = lastSeenValue?.toDate ? lastSeenValue.toDate() : (lastSeenValue?.seconds ? new Date(lastSeenValue.seconds * 1000) : (lastSeenValue ? new Date(lastSeenValue) : null));
  if(!dt || Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('pt-PT');
}
async function writePresence(online=true, extra={}){
  if(!currentUsername || !currentRole) return;
  try{
    await ensureFirebaseReady();
    const sid = ensurePresenceSessionId();
    await setDoc(doc(firestoreDb, PRESENCE_COLLECTION, sid), {
      sessionId: sid,
      uid: currentUserUid || currentUsername,
      userId: currentUsername,
      nome: currentUsername,
      email: currentUserEmail || '',
      role: currentRole,
      device: getPresenceDeviceType(),
      pagina: currentPresencePage || 'Dashboard',
      online,
      lastSeen: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      ...extra
    }, { merge:true });
  }catch(err){
    console.warn('Presença online indisponível:', err);
  }
}
async function startPresenceTracking(){
  currentPresencePage = document.getElementById('pageTitle')?.textContent?.trim() || currentPresencePage || 'Dashboard';
  await writePresence(true);
  if(presenceHeartbeatId) clearInterval(presenceHeartbeatId);
  presenceHeartbeatId = setInterval(() => { writePresence(true); }, PRESENCE_HEARTBEAT_MS);
  if(presenceRefreshId) clearInterval(presenceRefreshId);
  presenceRefreshId = setInterval(renderOnlineUsersList, 10000);
  bindOnlineUsersPanel();
}
async function stopPresenceTracking(){
  if(presenceHeartbeatId){ clearInterval(presenceHeartbeatId); presenceHeartbeatId = null; }
  if(presenceRefreshId){ clearInterval(presenceRefreshId); presenceRefreshId = null; }
  try{
    await writePresence(false, { signedOutAt: new Date().toISOString() });
  }catch(err){
    console.warn('Falha a terminar presença:', err);
  }
}
function updatePresencePage(pageName){
  currentPresencePage = pageName || document.getElementById('pageTitle')?.textContent?.trim() || 'Dashboard';
  if(currentUsername) writePresence(true, { pagina: currentPresencePage });
}
function renderOnlineUsersList(){
  const host = $('onlineUsersList');
  const counter = $('onlineUsersCounter');
  const updatedAt = $('onlineUsersUpdatedAt');
  if(!host) return;
  const activeRows = onlineUsersCache
    .map(row => ({...row, _presenceStatus: getOnlinePresenceStatus(row.lastSeen, row.online !== false)}))
    .filter(row => row._presenceStatus !== 'offline')
    .sort((a,b) => {
      const ta = a.lastSeen?.toDate ? a.lastSeen.toDate().getTime() : (a.lastSeen?.seconds ? a.lastSeen.seconds * 1000 : new Date(a.lastSeen || 0).getTime());
      const tb = b.lastSeen?.toDate ? b.lastSeen.toDate().getTime() : (b.lastSeen?.seconds ? b.lastSeen.seconds * 1000 : new Date(b.lastSeen || 0).getTime());
      return tb - ta;
    });
  if(counter) counter.textContent = String(activeRows.length);
  if(updatedAt) updatedAt.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' })}`;
  if(!activeRows.length){
    host.innerHTML = '<div class="online-empty">Sem sessões online de momento.</div>';
    return;
  }
  host.innerHTML = activeRows.map(row => {
    const stateLabel = row._presenceStatus === 'online' ? 'Online' : 'Inativo';
    const page = escapeHtml(row.pagina || 'Dashboard');
    const device = escapeHtml(row.device || '-');
    const role = escapeHtml(row.role || '-');
    const name = escapeHtml(row.nome || row.userId || 'Utilizador');
    const sessionShort = escapeHtml(String(row.sessionId || '').slice(0,8) || '-');
    const seen = escapeHtml(formatPresenceLastSeen(row.lastSeen));
    return `
      <div class="online-user-row">
        <div class="online-user-main">
          <div class="online-user-name">${name}</div>
          <div class="online-user-meta">${role} · sessão ${sessionShort}</div>
        </div>
        <div class="online-chip">${device}</div>
        <div class="online-user-page">${page}</div>
        <div class="online-user-meta">Última atividade<br><strong>${seen}</strong></div>
        <div class="online-status ${row._presenceStatus}">${stateLabel}</div>
      </div>
    `;
  }).join('');
}
function bindOnlineUsersPanel(){
  if(onlineUsersUnsub || !firestoreDb) return;
  const host = $('onlineUsersList');
  if(!host) return;
  onlineUsersUnsub = onSnapshot(collection(firestoreDb, PRESENCE_COLLECTION), snap => {
    onlineUsersCache = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderOnlineUsersList();
  }, err => {
    console.error('Erro a ler utilizadores online:', err);
    host.innerHTML = '<div class="online-empty">Não foi possível carregar os utilizadores online.</div>';
  });
  unsubs.push(() => {
    try{ onlineUsersUnsub && onlineUsersUnsub(); }catch{}
    onlineUsersUnsub = null;
  });
}
window.addEventListener('pagehide', () => {
  if(currentUsername){ writePresence(false, { hiddenAt: new Date().toISOString() }); }
});
document.addEventListener('visibilitychange', () => {
  if(!currentUsername) return;
  if(document.visibilityState === 'visible') writePresence(true, { pagina: currentPresencePage || 'Dashboard' });
});


const $ = (id) => document.getElementById(id);
initUiScale();
const navButtons = document.querySelectorAll('.nav-btn');
const bottomButtons = document.querySelectorAll('.bottom-btn');
const pages = document.querySelectorAll('.page');


function applyUiScale(scale){
  document.body.classList.remove('ui-auto','ui-laptop','ui-compact','ui-normal','ui-large');
  const validScales = ['auto','laptop','compact','normal','large'];
  const finalScale = validScales.includes(scale) ? scale : 'compact';
  document.body.classList.add(`ui-${finalScale}`);
  localStorage.setItem('uiScale', finalScale);
  const select = document.getElementById('uiScaleSelect');
  if(select) select.value = finalScale;
}

function bindUiScaleSelector(){
  const select = document.getElementById('uiScaleSelect');
  if(!select) return;
  const savedScale = localStorage.getItem('uiScale') || detectDefaultScale();
  select.value = savedScale;
  if(select.dataset.bound === '1') return;
  select.dataset.bound = '1';
  select.addEventListener('change', function(){
    applyUiScale(this.value);
  });
}

function detectDefaultScale(){
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  if(w <= 1366 && h <= 768) return 'laptop';
  if(w <= 1400) return 'compact';
  return 'auto';
}

function initUiScale(){
  const savedScale = localStorage.getItem('uiScale') || detectDefaultScale();
  applyUiScale(savedScale);
  bindUiScaleSelector();
}


const euro = (v) => Number(v || 0).toLocaleString('pt-PT', {style:'currency', currency:'EUR'});
const fmtDate = (v) => { if(!v) return '-'; const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleDateString('pt-PT'); };
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const isMasterAdmin = () => currentRole === 'master_admin';
const isAdminLike = () => hasRolePermission('manage_work_orders') || hasRolePermission('manage_clients') || hasRolePermission('manage_payments') || isMasterAdmin();


function updateTrabalhoAdvancedFields(){
  const isEditing = !!($('trabalhoId') && $('trabalhoId').value);
  const canSee = isMasterAdmin() || isEditing;
  document.querySelectorAll('.master-edit-only').forEach(el => {
    el.classList.toggle('is-hidden-by-role', !canSee);
  });

  if(!canSee){
    if($('valor')) $('valor').value = '';
    if($('dataInicio')) $('dataInicio').value = '';
    if($('dataFim')) $('dataFim').value = '';
    if($('estado')) $('estado').value = 'Pendente';
  }
}


const ESTADOS_TRABALHO = ['Pendente','Em curso','Concluído','Pago','Entregue','Cancelado'];

function normalizeEstado(value=''){
  const raw = String(value || '').trim();
  if(raw === 'Em andamento') return 'Em curso';
  if(raw === 'Aguarda peça' || raw === 'Aguardando peça') return 'Aguardar peça';
  if(raw === 'Fechado') return 'Concluído';
  return ESTADOS_TRABALHO.includes(raw) ? raw : 'Pendente';
}

function makeStateHistoryEntry(estado, dateValue){
  const iso = dateValue || new Date().toISOString();
  return { estado: normalizeEstado(estado), data: iso };
}

function normalizeHistoricoEstados(list, fallbackEstado='Pendente', fallbackDate=''){
  const source = Array.isArray(list) ? list : [];
  const mapped = source
    .map(item => {
      if(!item) return null;
      if(typeof item === 'string') return makeStateHistoryEntry(item, fallbackDate || new Date().toISOString());
      const estado = normalizeEstado(item.estado || item.state || item.label || fallbackEstado);
      const data = item.data || item.date || item.dataEstado || fallbackDate || new Date().toISOString();
      return makeStateHistoryEntry(estado, data);
    })
    .filter(Boolean);

  if(!mapped.length){
    mapped.push(makeStateHistoryEntry(fallbackEstado, fallbackDate || new Date().toISOString()));
  }

  const deduped = [];
  mapped.forEach(entry => {
    const last = deduped[deduped.length - 1];
    if(last && last.estado === entry.estado && String(last.data) === String(entry.data)) return;
    deduped.push(entry);
  });
  return deduped;
}

function normalizeTrabalhoStateShape(t){
  const estado = normalizeEstado(t?.estado || 'Pendente');
  const dataEstado = t?.dataEstado || t?.updatedAt || t?.dataFim || t?.dataInicio || new Date().toISOString();
  const historicoEstados = normalizeHistoricoEstados(t?.historicoEstados, estado, dataEstado);
  const last = historicoEstados[historicoEstados.length - 1];
  return {
    ...t,
    estado,
    dataEstado: last?.data || dataEstado,
    historicoEstados
  };
}

function formatDateTime(value){
  if(!value) return '-';
  const d = new Date(value);
  return isNaN(d) ? '-' : d.toLocaleString('pt-PT');
}

function buildStateHistoryHtml(t){
  const history = normalizeHistoricoEstados(t?.historicoEstados, t?.estado || 'Pendente', t?.dataEstado || t?.dataInicio || '');
  return history.slice().reverse().map(item => `
    <div class="state-history-item">
      <strong><span class="badge" data-state="${escapeHtml(item.estado || '-')}">${escapeHtml(item.estado || '-')}</span></strong>
      <span class="state-history-meta">${escapeHtml(formatDateTime(item.data))}</span>
    </div>
  `).join('');
}


const ESTADOS_FLUXO = ['Pendente','Em curso','Concluído','Entregue'];

function getFlowEstado(value=''){
  const estado = normalizeEstado(value);
  if(estado === 'Agendado') return 'Pendente';
  if(estado === 'Aguardar peça') return 'Em curso';
  if(estado === 'Pago') return 'Entregue';
  return ESTADOS_FLUXO.includes(estado) ? estado : 'Pendente';
}

function getNextFlowEstado(value=''){
  const atual = getFlowEstado(value);
  const idx = ESTADOS_FLUXO.indexOf(atual);
  return idx >= 0 && idx < ESTADOS_FLUXO.length - 1 ? ESTADOS_FLUXO[idx + 1] : null;
}


function isMasterAdminUser(){
  try{
    const role = String(window.currentRole || (typeof currentRole !== 'undefined' ? currentRole : '') || '').toLowerCase();
    return role === 'master_admin';
  }catch(e){
    return false;
  }
}

function isEditingTrabalho(){
  try{
    const idEl = document.getElementById('trabalhoId');
    return !!(idEl && String(idEl.value || '').trim());
  }catch(e){
    return false;
  }
}

function updateTrabalhoFieldVisibility(){
  const showAdvanced = isMasterAdminUser() || isEditingTrabalho();
  document.querySelectorAll('.advanced-work-field').forEach(el => {
    el.classList.toggle('field-hidden-by-role', !showAdvanced);
  });
}


function getTodayLocalDateStr(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setWorkEstadoById(id, novoEstado){
  const trabalhosLista = window.trabalhos || (typeof trabalhos !== 'undefined' ? trabalhos : []);
  const t = trabalhosLista.find(x => String(x.id) === String(id));
  if(!t) return;

  const estadoAnterior = typeof getFlowEstado === 'function' ? getFlowEstado(t.estado || 'Pendente') : (t.estado || 'Pendente');
  const estadoFinal = typeof getFlowEstado === 'function' ? getFlowEstado(novoEstado || estadoAnterior) : (novoEstado || estadoAnterior);
  const hoje = getTodayLocalDateStr();

  if(estadoAnterior === 'Pendente' && estadoFinal === 'Em curso' && !String(t.dataInicio || '').trim()){
    t.dataInicio = hoje;
  }

  if((estadoFinal === 'Concluído' || estadoFinal === 'Entregue') && !String(t.dataFim || '').trim()){
    t.dataFim = hoje;
  }

  t.estado = estadoFinal;
  t.dataEstado = new Date().toISOString();
  t.historicoEstados = Array.isArray(t.historicoEstados) ? t.historicoEstados : [];
  t.historicoEstados.push({
    estado: estadoFinal,
    data: new Date().toISOString()
  });

  try{
    if(typeof window.trabalhos !== 'undefined') window.trabalhos = trabalhosLista;
    if(typeof trabalhos !== 'undefined') trabalhos = trabalhosLista;
  }catch(e){}

  try{
    if(typeof saveLocal === 'function') saveLocal();
    else if(typeof window.saveData === 'function') window.saveData();
    else if(typeof saveData === 'function') saveData();
    else if(typeof window.saveTrabalhos === 'function') window.saveTrabalhos();
    else if(typeof saveTrabalhos === 'function') saveTrabalhos();
    else localStorage.setItem('trabalhos', JSON.stringify(trabalhosLista));
  }catch(e){
    console.error('Erro ao guardar estado localmente:', e);
  }

  Promise.resolve()
    .then(async () => {
      try{
        if(typeof upsertRemote === 'function' && typeof syncReady !== 'undefined' && syncReady){
          await upsertRemote('trabalhos', t);
        }
      }catch(e){
        console.error('Erro ao sincronizar estado no Firebase:', e);
      }
    })
    .finally(() => {
      try { if(typeof window.renderTrabalhos === 'function') window.renderTrabalhos(); else if(typeof renderTrabalhos === 'function') renderTrabalhos(); } catch(e) {}
      try { if(typeof window.renderDashboard === 'function') window.renderDashboard(); else if(typeof renderDashboard === 'function') renderDashboard(); } catch(e) {}
      try { if(typeof window.renderPagamentos === 'function') window.renderPagamentos(); else if(typeof renderPagamentos === 'function') renderPagamentos(); } catch(e) {}
      try { if(typeof window.renderRelatorios === 'function') window.renderRelatorios(); else if(typeof renderRelatorios === 'function') renderRelatorios(); } catch(e) {}
    });
}


function buildFlowButtons(t){
  if(!isAdminLike()) return '';
  const atual = getFlowEstado(t.estado || 'Pendente');
  const isPaid = t && t.paymentStatus === 'Pago';
  const nextEstado = getNextFlowEstado(t.estado || 'Pendente');

  if(isPaid || atual === 'Pago'){
    return `<span class="stage-step done final-paid">Pago${t.dataPagamento ? ` • ${escapeHtml(fmtDate(t.dataPagamento))}` : ''}</span>`;
  }

  if(atual === 'Entregue' || !nextEstado){
    return `<button class="stage-step stage-control-btn pay-warning" onclick="window.marcarComoPagoComValor('${t.id}')">Por pagar</button>`;
  }

  return `<button class="stage-step stage-control-btn next" onclick="setWorkEstadoById('${t.id}','${nextEstado}')">${escapeHtml(nextEstado)}</button>`;
}


function getPaymentBadgeHtml(t){
  return t && t.paymentStatus === 'Pago' ? `<span class="payment-badge-inline">Pago${t.dataPagamento ? ` • ${escapeHtml(fmtDate(t.dataPagamento))}` : ''}</span>` : '';
}
window.setWorkEstadoById = setWorkEstadoById;

function genId(prefix='id'){
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

function refreshLastTrabIdFromWorks(){
  const maxExistingId = trabalhos.reduce((max, t) => {
    const n = getWorkCodeNumber(t?.workCode || t?.ordemId || t?.id || '');
    return Math.max(max, n);
  }, 0);
  lastTrabId = Math.max(Number(lastTrabId || 0) || 0, maxExistingId);
  try{ localStorage.setItem(STORAGE_KEYS.lastTrabId, String(lastTrabId)); }catch{}
  return lastTrabId;
}

function nextTrabalhoIdPreview(){
  const nextId = refreshLastTrabIdFromWorks() + 1;
  return `TRAB-${String(nextId).padStart(4,'0')}`;
}

function nextTrabalhoId(){
  lastTrabId = refreshLastTrabIdFromWorks() + 1;
  localStorage.setItem(STORAGE_KEYS.lastTrabId, String(lastTrabId));
  return `TRAB-${String(lastTrabId).padStart(4,'0')}`;
}


function getWorkCodeNumber(value){
  const m = String(value || '').match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function generateWorkCode(existingId=''){
  if(existingId) return existingId;
  const maxExisting = trabalhos.reduce((max, t) => Math.max(max, getWorkCodeNumber(t.workCode || t.ordemId || '')), 0);
  return `TRAB-${String(maxExisting + 1).padStart(4,'0')}`;
}

function normalizeTrabalhosIds(){
  let changed = false;
  let maxExisting = trabalhos.reduce((max, t) => Math.max(max, getWorkCodeNumber(t.workCode || t.ordemId || '')), 0);
  trabalhos = trabalhos.map(t => {
    if(t.workCode || t.ordemId) return normalizeTrabalhoStateShape({ ...t, workCode: t.workCode || t.ordemId });
    changed = true;
    maxExisting += 1;
    return normalizeTrabalhoStateShape({ ...t, workCode: `TRAB-${String(maxExisting).padStart(4,'0')}` });
  });
  refreshLastTrabIdFromWorks();
  if(changed) saveLocal();
}


function loadLocal(){
  try{trabalhos=(JSON.parse(localStorage.getItem(STORAGE_KEYS.trabalhos))||[]).map(normalizeTrabalhoStateShape)}catch{trabalhos=[]}
  try{clientes=JSON.parse(localStorage.getItem(STORAGE_KEYS.clientes))||[]}catch{clientes=[]}
  try{pagamentos=JSON.parse(localStorage.getItem(STORAGE_KEYS.pagamentos))||[]}catch{pagamentos=[]}
  try{ lastTrabId = Number(localStorage.getItem(STORAGE_KEYS.lastTrabId) || 0) || 0 }catch{ lastTrabId = 0 }
  normalizeTrabalhosIds();
  refreshLastTrabIdFromWorks();
}
function saveLocal(){
  localStorage.setItem(STORAGE_KEYS.trabalhos, JSON.stringify(trabalhos));
  localStorage.setItem(STORAGE_KEYS.clientes, JSON.stringify(clientes));
  localStorage.setItem(STORAGE_KEYS.pagamentos, JSON.stringify(pagamentos));
  localStorage.setItem(STORAGE_KEYS.lastTrabId, String(lastTrabId));
  autoBackupInvisible();
}

function populateClientOptions(selected=''){
  const select = $('cliente');
  if(!select) return;
  const current = selected || select.value || '';
  const sorted = clientes.slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  select.innerHTML = ['<option value="">Selecionar cliente</option>']
    .concat(sorted.map(c => `<option value="${escapeHtml(c.nome || '')}">${escapeHtml(c.nome || '')}</option>`))
    .join('');
  if(current) select.value = current;
  fillClientContactFromSelection();
}
function updateWorkCodePreview(){
  const field = $('workCodeDisplay');
  const idField = $('trabalhoId');
  if(!field) return;
  if(idField && idField.value) return;
  field.value = nextTrabalhoIdPreview();
}

function fillClientContactFromSelection(){
  const select = $('cliente');
  const contacto = $('contacto');
  if(!select || !contacto) return;
  const selectedName = select.value;
  const c = clientes.find(x => (x.nome || '') === selectedName);
  contacto.value = c ? (c.telefone || '') : '';
}


function normalizeManagedUsers(users){
  const list = Array.isArray(users) ? users.slice() : [];
  const idx = list.findIndex(u => String(u?.email || '').trim().toLowerCase() === 'pica.fern@gmail.com' || String(u.username || '').toLowerCase() === 'pica.fern');
  const primaryAdmin = { username: 'pica.fern', email: 'pica.fern@gmail.com', password: '', role: 'master_admin' };
  if(idx >= 0) list[idx] = { ...list[idx], ...primaryAdmin };
  else list.push(primaryAdmin);
  return list;
}

function getManagedUsers(){
  try{
    const stored = JSON.parse(localStorage.getItem('app_users') || 'null');
    if(Array.isArray(stored) && stored.length){
      const fixed = normalizeManagedUsers(stored);
      localStorage.setItem('app_users', JSON.stringify(fixed));
      return fixed;
    }
  }catch{}
  const fixedDefaults = normalizeManagedUsers([
    { username: 'jorge', email: 'jorge@empresa.pt', password: 'jfernandes', role: 'admin' },
    { username: 'fatima', email: 'fatima@empresa.pt', password: 'ffernandes', role: 'user' },
    { username: 'pica.fern', email: 'pica.fern@gmail.com', password: '', role: 'master_admin' }
  ]);
  localStorage.setItem('app_users', JSON.stringify(fixedDefaults));
  return fixedDefaults;
}

function saveManagedUsers(users){
  localStorage.setItem('app_users', JSON.stringify(users));
}

function renderManagedUsers(){
  const tbody = $('managedUsersTableBody');
  if(!tbody) return;
  const users = getManagedUsers();
  tbody.innerHTML = users.length ? users.map((u, idx) => `
    <tr>
      <td>${escapeHtml(u.username || '-')}</td>
      <td>${escapeHtml(u.email || '-')}</td>
      <td>${escapeHtml(u.role || 'user')}</td>
      <td>
        <div class="row-actions">
          <button class="small-btn" onclick="window.editManagedUser(${idx})">Editar</button>
          <button class="small-btn danger" onclick="window.deleteManagedUser(${idx})">Apagar</button>
        </div>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="4">Sem utilizadores.</td></tr>';
}

window.editManagedUser = function(index){
  if(!hasRolePermission('manage_users')) return;
  const users = getManagedUsers();
  const u = users[index];
  if(!u) return;
  $('managedUserIndex').value = String(index);
  $('managedUsername').value = u.username || '';
  $('managedEmail').value = u.email || '';
  $('managedPassword').value = u.password || '';
  $('managedRole').value = u.role || 'user';
  switchTab('configuracoes');
};

window.deleteManagedUser = function(index){
  if(!hasRolePermission('manage_users')) return;
  const users = getManagedUsers();
  const u = users[index];
  if(!u) return;
  if(!confirm(`Apagar o utilizador ${u.username}?`)) return;
  users.splice(index, 1);
  saveManagedUsers(users);
  renderManagedUsers();
  updateWorkCodePreview();
  updateWorkCodePreview();
  renderMobileCards();
};

function autoBackupInvisible(){
  const payload = {
    exportadoEm: new Date().toISOString(),
    appVersion: APP_VERSION,
    currentUsername,
    currentRole,
    trabalhos,
    clientes,
    pagamentos
  };
  localStorage.setItem('ge_invisible_backup', JSON.stringify(payload));
}
function setSyncMessage(msg, level='warn'){
  syncMessage = msg;
  const mode = $('modeLine');
  if (mode) {
    mode.textContent = `Modo: ${msg}`;
    mode.classList.remove('sync-ok','sync-warn','sync-bad');
    mode.classList.add(level === 'ok' ? 'sync-ok' : (level === 'bad' ? 'sync-bad' : 'sync-warn'));
  }
  const note = $('syncLoginNote');
  if (note) {
    note.innerHTML = `<strong>Sync:</strong> ${msg}`;
    note.classList.remove('sync-ok','sync-warn','sync-bad');
    note.classList.add(level === 'ok' ? 'sync-ok' : (level === 'bad' ? 'sync-bad' : 'sync-warn'));
  }
}
function setRoleUI(){
  if(!currentRole) return;
  const roleLabel = currentRole === 'master_admin' ? 'Admin Mestre' : (currentRole === 'admin' ? 'Admin' : 'User');
  document.body.classList.toggle('role-view-user', currentRole === 'user');
  document.body.classList.toggle('role-view-admin', currentRole === 'admin');
  $('roleBadge').textContent = roleLabel;
  $('roleLine').textContent = `Role: ${roleLabel}`;
  $('versionBadge').textContent = APP_VERSION;
  $('currentUserName').textContent = currentUsername || 'Utilizador';
  const usersSection = $('usersSection');
  if(usersSection) usersSection.style.display = isMasterAdmin() ? 'block' : 'none';
  const workCodeField = $('workCodeDisplay');
  if(workCodeField){
    workCodeField.readOnly = !isMasterAdmin();
    if(!workCodeField.value){
      workCodeField.value = nextTrabalhoIdPreview();
    }
  }
  setSyncMessage(syncReady ? 'Firebase Sync' : syncMessage, syncReady ? 'ok' : 'warn');
  try{ updateTrabalhoFieldVisibility(); }catch(e){}
  updateTrabalhoAdvancedFields();
}
function switchTab(tab){
  if(!canAccessTab(tab)){
    const fallback = getAllowedTabsForRole(currentRole)[0] || 'dashboard';
    if(tab !== fallback) alert('Sem acesso a essa área para a tua role.');
    tab = fallback;
  }
  try{ sessionStorage.setItem('gestao:lastTab', tab); }catch(e){}
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  bottomButtons.forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  pages.forEach(p => p.classList.toggle('active', p.id===`${tab}-page`));
  const btn=document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  $('pageTitle').textContent = btn ? btn.textContent.trim() : 'Dashboard';
  if(tab === 'dashboard'){
    renderDashboard();
    renderAlerts();

  }
  if(tab === 'trabalhos') renderTrabalhos();
  if(tab === 'clientes') renderClientes();
  if(tab === 'pagamentos') renderPagamentos();
  if(tab === 'relatorios') renderRelatorios();
  try{ renderAdvancedReports(); }catch(e){}
  if(tab === 'configuracoes'){
    bindUiScaleSelector();
    renderManagedUsers();
  }
  updatePresencePage(document.getElementById('pageTitle')?.textContent?.trim() || tab);
  window.scrollTo({top:0,behavior:'smooth'});
}
navButtons.forEach(b => b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
bottomButtons.forEach(b => b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', ()=>switchTab(b.dataset.go)));

function forceAppRefresh(){
  try{
    const activePage = document.querySelector('.page.active');
    const activeTab = activePage ? activePage.id.replace(/-page$/, '') : (sessionStorage.getItem('gestao:lastTab') || 'dashboard');
    sessionStorage.setItem('gestao:lastTab', activeTab);
  }catch(e){}
  setTimeout(()=>{
    try{ window.location.reload(); }catch(e){ location.reload(); }
  }, 120);
}
try{
  const restoreTab = sessionStorage.getItem('gestao:lastTab');
  if(restoreTab){
    setTimeout(()=>{ try{ switchTab(restoreTab); }catch(e){} }, 0);
  }
}catch(e){}

let firebaseSyncInitPromise = null;
async function waitForFirebaseSyncReady(timeoutMs = 12000){
  const start = Date.now();
  while(!firestoreDb){
    if(Date.now() - start > timeoutMs) throw new Error('Firebase não ficou pronto a tempo');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return true;
}

async function ensureAuthReady(timeoutMs = 12000){
  await waitForFirebaseSyncReady(timeoutMs);
  const start = Date.now();
  while(!firebaseAuth){
    if(Date.now() - start > timeoutMs) throw new Error('Firebase Auth não ficou pronto a tempo');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return true;
}
async function initFirebaseSync(){
  if(firebaseSyncInitPromise) return firebaseSyncInitPromise;
  firebaseSyncInitPromise = (async()=>{
    try{
      if (!firebaseApp) firebaseApp = initializeApp(firebaseConfig);
      if (!firebaseAuth) firebaseAuth = getAuth(firebaseApp);
      if (!firestoreDb) firestoreDb = getFirestore(firebaseApp);

      syncReady = true;
      setSyncMessage('Firebase Sync', 'ok');
      clearRealtimeListeners();
      attachRealtimeListeners();

      onAuthStateChanged(firebaseAuth, user => {
        syncReady = true;
        setSyncMessage(user ? 'Firebase Sync' : 'Firebase pronto', user ? 'ok' : 'warn');
        clearRealtimeListeners();
        attachRealtimeListeners();
        if (currentRole) renderAll();
      });

      await waitForFirebaseSyncReady();
      return true;
    }catch(err){
      console.error('Firebase sync error:', err);
      syncReady = false;
      firebaseSyncInitPromise = null;
      const msg = location.protocol === 'file:'
        ? 'Abre por servidor/GitHub Pages (não file://)'
        : err?.code === 'auth/operation-not-allowed'
          ? 'Ativa Email/Password Auth no Firebase'
          : 'Local (Firebase indisponível)';
      setSyncMessage(msg, 'bad');
      throw err;
    }
  })();
  return firebaseSyncInitPromise;
}

function clearRealtimeListeners(){
  unsubs.forEach(fn => { try{ fn(); }catch{} });
  unsubs = [];
}
function attachRealtimeListeners(){
  if (!firestoreDb || unsubs.length) return;
  const bind = (name, setter) => {
    const unsub = onSnapshot(collection(firestoreDb, name), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setter(rows);
      saveLocal();
      if (currentRole) renderAll();
    }, err => {
      console.error(`Snapshot ${name} failed:`, err);
      setSyncMessage('Erro de sync, uso local', 'bad');
    });
    unsubs.push(unsub);
  };
  bind('trabalhos', rows => { trabalhos = rows.map(r => normalizeTrabalhoStateShape({ ...r, workCode: r.workCode || r.ordemId || '' })); normalizeTrabalhosIds(); refreshLastTrabIdFromWorks(); });
  bind('clientes', rows => { clientes = rows; });
  bind('pagamentos', rows => { pagamentos = rows; });
}
async function ensureFirebaseReady(timeoutMs = 12000){
  if (!firestoreDb) {
    await initFirebaseSync();
    await waitForFirebaseSyncReady(timeoutMs);
  }
  return true;
}
async function upsertRemote(collectionName, item){
  if (!item?.id) throw new Error(`Documento sem id em ${collectionName}`);
  await ensureFirebaseReady();
  await setDoc(doc(firestoreDb, collectionName, item.id), item, { merge: true });
  return true;
}
async function removeRemote(collectionName, id){
  if (!id) throw new Error(`Id inválido para apagar em ${collectionName}`);
  await ensureFirebaseReady();
  await deleteDoc(doc(firestoreDb, collectionName, id));
  return true;
}


function adminGuard(permission='manage_work_orders', deniedMessage='Sem permissão para esta ação.'){ return roleGuard(permission, deniedMessage); }
function printHtml(title, bodyHtml){ const win=window.open('', '_blank'); if(!win) return; win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1,h2{margin:0 0 10px}.meta{color:#555;margin-bottom:20px}.card{border:1px solid #ddd;border-radius:12px;padding:18px;margin:12px 0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left}
/* ===== MOBILE PREMIUM OVERRIDES 1.0.6 ===== */
@media (max-width: 900px){
  :root{
    --mobile-gap:12px;
  }
  html{
    -webkit-text-size-adjust:100%;
  }
  body{
    min-height:100dvh;
    overscroll-behavior-y:contain;
  }
  .login-screen{
    min-height:100dvh;
    align-items:flex-start;
    padding:14px 12px calc(14px + env(safe-area-inset-bottom));
  }
  .login-card{
    width:100%;
    padding:14px;
    border-radius:24px;
    gap:14px;
    box-shadow:0 12px 36px rgba(0,0,0,.24);
  }
  .login-brand,
  .login-panel{
    border-radius:22px;
    padding:16px;
  }
  .clean-brand-copy h1,
  .login-only-title h1{
    font-size:34px!important;
    line-height:1.02;
    margin-bottom:8px;
  }
  .company-logo-large{
    max-width:160px!important;
    max-height:160px!important;
  }
  .app-shell{
    min-height:100dvh;
    padding-bottom:calc(88px + env(safe-area-inset-bottom));
  }
  .main{
    padding:12px 12px calc(96px + env(safe-area-inset-bottom))!important;
  }
  .topbar{
    position:sticky;
    top:0;
    z-index:40;
    padding:2px 0 10px;
    margin-bottom:10px;
    background:linear-gradient(180deg, rgba(6,10,18,.96), rgba(6,10,18,.76));
    backdrop-filter:blur(12px);
    border-bottom:1px solid rgba(255,255,255,.04);
  }
  .topbar-left{
    gap:4px;
  }
  #pageTitle{
    font-size:24px!important;
    line-height:1.08;
    letter-spacing:-.02em;
  }
  .subline{
    gap:5px;
    font-size:11px!important;
    line-height:1.3;
  }
  .global-search{
    min-height:48px!important;
    border-radius:16px!important;
  }
  .hero-panel,
  .panel,
  .form-panel,
  .history-panel,
  .payments-panel,
  .setting-card,
  .alert-card,
  .stat-card,
  .report-card,
  .mobile-card{
    border-radius:22px!important;
    box-shadow:0 10px 28px rgba(0,0,0,.16);
  }
  .hero-panel{
    padding:16px!important;
  }
  .hero-copy h3{
    font-size:24px!important;
    line-height:1.06;
    margin-bottom:8px!important;
  }
  .hero-copy p{
    font-size:14px!important;
    line-height:1.5;
  }
  .hero-actions{
    position:sticky;
    bottom:calc(84px + env(safe-area-inset-bottom));
    z-index:45;
    display:grid!important;
    grid-template-columns:1fr 1fr;
    gap:10px;
    padding-top:8px;
  }
  .btn,
  .small-btn,
  .bottom-btn{
    min-height:48px!important;
  }
  .btn{
    border-radius:16px!important;
    justify-content:center;
    width:100%;
  }
  .content-grid,
  .dashboard-grid,
  .stats-grid,
  .clientes-grid,
  .settings-grid,
  .alert-grid,
  .client-summary-grid,
  .form-grid{
    gap:12px!important;
  }
  .field{
    gap:6px;
  }
  .field label{
    font-size:12px!important;
    font-weight:600;
    color:#b8c4e0;
  }
  input,select,textarea{
    font-size:16px!important;
    min-height:50px!important;
    border-radius:16px!important;
    padding:14px 14px!important;
  }
  textarea{
    min-height:120px!important;
  }
  .mobile-cards-wrap{
    gap:12px!important;
  }
  .mobile-card{
    padding:14px!important;
  }
  .mobile-card-title{
    font-size:17px!important;
  }
  .mobile-card-sub{
    font-size:13px!important;
  }
  .mobile-card-item{
    border-radius:14px!important;
    padding:10px 12px!important;
  }
  .row-actions{
    grid-template-columns:1fr 1fr!important;
    gap:10px!important;
  }
  .row-actions .small-btn{
    width:100%;
    border-radius:14px!important;
    padding:11px 12px!important;
    font-weight:700;
  }
  .badge,
  .invoice-badge{
    font-size:12px!important;
    padding:7px 10px!important;
  }
  .modal{
    align-items:end!important;
    padding:10px!important;
  }
  .modal-card{
    width:100%!important;
    max-width:100%!important;
    border-radius:24px 24px 18px 18px!important;
    max-height:min(82dvh, 760px);
    overflow:auto;
  }
  .payment-method-grid{
    grid-template-columns:1fr 1fr!important;
    gap:10px!important;
  }
  .pay-method-btn{
    min-height:62px!important;
    border-radius:18px!important;
  }
  .bottom-nav{
    left:10px!important;
    right:10px!important;
    bottom:calc(10px + env(safe-area-inset-bottom))!important;
    padding:10px!important;
    gap:8px!important;
    border-radius:24px!important;
    box-shadow:0 14px 36px rgba(0,0,0,.28)!important;
  }
  .bottom-btn{
    min-width:96px!important;
    font-size:13px!important;
    padding:11px 10px!important;
    border-radius:16px!important;
  }
  .env-switch-btn{
    right:12px!important;
    bottom:calc(158px + env(safe-area-inset-bottom))!important;
    top:auto!important;
  }
  .env-badge{
    right:12px!important;
    bottom:calc(116px + env(safe-area-inset-bottom))!important;
    top:auto!important;
  }
}
@media (max-width: 520px){
  .main{
    padding:10px 10px calc(96px + env(safe-area-inset-bottom))!important;
  }
  .hero-actions{
    grid-template-columns:1fr!important;
  }
  .row-actions{
    grid-template-columns:1fr!important;
  }
  .payment-method-grid{
    grid-template-columns:1fr!important;
  }
  .mobile-card-grid{
    grid-template-columns:1fr!important;
  }
  .bottom-btn{
    min-width:88px!important;
    font-size:12px!important;
  }
}




/* enterprise actions strip */
.actions-cell{min-width:520px}
.enterprise-actions{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;padding-bottom:2px;max-width:100%}
.enterprise-actions::-webkit-scrollbar{height:6px}
.enterprise-actions::-webkit-scrollbar-thumb{background:rgba(148,163,184,.35);border-radius:999px}
.enterprise-actions .small-btn,
.enterprise-actions .stage-chip,
.enterprise-actions .payment-badge-inline,
.enterprise-actions .invoice-badge{flex:0 0 auto;white-space:nowrap}
.enterprise-actions .small-btn{padding:7px 10px;font-size:12px;border-radius:12px}
.enterprise-actions .stage-chip{padding:6px 10px;font-size:11px}
.enterprise-actions .payment-badge-inline{padding:6px 10px}
@media (max-width: 900px){
  .actions-cell{min-width:unset}
  .enterprise-actions{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;white-space:nowrap}
}


.desc-status-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:34px;
  border-radius:999px;
  padding:8px 14px;
  font-size:12px;
  font-weight:800;
  letter-spacing:.01em;
  line-height:1;
  border:1px solid rgba(255,255,255,.10);
  white-space:nowrap;
}
button.desc-status-btn{
  cursor:pointer;
  transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
button.desc-status-btn:hover{transform:translateY(-1px)}
.desc-status-btn.has-desc{
  background:linear-gradient(180deg, rgba(37,99,235,.26), rgba(29,78,216,.18));
  border-color:rgba(96,165,250,.42);
  color:#dbeafe;
  box-shadow:0 0 0 1px rgba(59,130,246,.12) inset, 0 6px 14px rgba(37,99,235,.14);
}
.desc-status-btn.no-desc{
  background:linear-gradient(180deg, rgba(148,163,184,.12), rgba(100,116,139,.08));
  border-color:rgba(148,163,184,.20);
  color:#94a3b8;
}
.stage-control-btn{
  cursor:pointer;
  transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
.stage-control-btn:hover{transform:translateY(-1px)}
.stage-control-btn.next{
  background:linear-gradient(180deg, rgba(245,158,11,.22), rgba(217,119,6,.16));
  border-color:rgba(252,211,77,.38);
  color:#fef3c7;
  box-shadow:0 0 0 1px rgba(245,158,11,.08) inset;
}
.stage-control-btn.next::before{
  content:'→';
  font-size:11px;
  font-weight:900;
  margin-right:6px;
  color:#fde68a;
}
.stage-control-btn.pay{
  background:linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color:rgba(74,222,128,.40);
  color:#dcfce7;
  box-shadow:0 0 0 1px rgba(34,197,94,.10) inset;
}
.stage-control-btn.pay::before{
  content:'€';
  font-size:11px;
  font-weight:900;
  margin-right:6px;
  color:#bbf7d0;
}
.stage-step.final-paid{
  background:linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color:rgba(74,222,128,.40);
  color:#dcfce7;
}
.stage-step.final-paid::before{
  content:'✓';
  font-size:11px;
  font-weight:900;
  margin-right:6px;
  color:#bbf7d0;
}


.pipeline-like-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:34px;
  border-radius:999px;
  padding:8px 14px;
  font-size:12px;
  font-weight:800;
  letter-spacing:.01em;
  line-height:1;
  border:1px solid rgba(255,255,255,.10);
  white-space:nowrap;
  cursor:pointer;
  transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease, opacity .15s ease;
}
.pipeline-like-btn:hover{transform:translateY(-1px)}
.pipeline-like-btn.desc-btn{
  background:linear-gradient(180deg, rgba(37,99,235,.26), rgba(29,78,216,.18));
  border-color:rgba(96,165,250,.42);
  color:#dbeafe;
  box-shadow:0 0 0 1px rgba(59,130,246,.12) inset, 0 6px 14px rgba(37,99,235,.14);
}
.pipeline-like-btn.edit-btn{
  background:linear-gradient(180deg, rgba(245,158,11,.22), rgba(217,119,6,.16));
  border-color:rgba(252,211,77,.38);
  color:#fef3c7;
  box-shadow:0 0 0 1px rgba(245,158,11,.08) inset;
}
.pipeline-like-btn.delete-btn{
  background:linear-gradient(180deg, rgba(239,68,68,.22), rgba(185,28,28,.16));
  border-color:rgba(252,165,165,.34);
  color:#fee2e2;
  box-shadow:0 0 0 1px rgba(239,68,68,.08) inset;
}
.pipeline-like-btn.fatura-btn{
  background:linear-gradient(180deg, rgba(168,85,247,.22), rgba(126,34,206,.16));
  border-color:rgba(216,180,254,.32);
  color:#f3e8ff;
  box-shadow:0 0 0 1px rgba(168,85,247,.08) inset;
}


.stage-arrow{
  opacity:.55;
  margin:0 4px;
  font-weight:800;
}

/* AÇÕES ALINHADAS FIXAS */
td.acoes-col, .acoes-col{
  min-width: 760px;
  width: 760px;
}
.enterprise-actions{
  display:grid;
  grid-template-columns: 124px 92px 86px 86px minmax(240px, 1fr);
  align-items:center;
  gap:8px;
  width:100%;
}
.enterprise-actions > *{
  min-width:0;
}
.enterprise-actions .stage-arrow{
  margin:0 6px;
}
.enterprise-actions .desc-status-btn,
.enterprise-actions .pipeline-like-btn,
.enterprise-actions .stage-step,
.enterprise-actions .stage-control-btn{
  justify-self:start;
}
.enterprise-actions .stage-step,
.enterprise-actions .stage-control-btn{
  white-space:nowrap;
}
.enterprise-actions .stage-flow{
  display:flex;
  align-items:center;
  min-width:0;
}
.enterprise-actions .stage-flow .stage-step.current{
  min-width:92px;
  justify-content:center;
}
.enterprise-actions .stage-flow .stage-control-btn{
  min-width:118px;
  justify-content:center;
}
.enterprise-actions .stage-flow .stage-step.done.final-paid{
  min-width:152px;
  justify-content:center;
}
@media (max-width: 1100px){
  td.acoes-col, .acoes-col{
    min-width: auto;
    width:auto;
  }
  .enterprise-actions{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
  }
}


.pipeline-like-btn.fatura-disabled{
  background:linear-gradient(180deg, rgba(148,163,184,.12), rgba(100,116,139,.08));
  border-color:rgba(148,163,184,.20);
  color:#94a3b8;
  box-shadow:none;
  cursor:default;
  pointer-events:none;
}


.stage-flow{
  display:flex;
  align-items:center;
  justify-content:flex-start;
  min-width:0;
}
.stage-flow .stage-arrow{display:none !important;}
.stage-flow:empty{display:none;}

.payment-value-group{margin-top:10px}
.payment-value-group input{width:100%}
#paymentMethodModal.show{display:flex}

/* Pago NÃO feito (aviso) */
.stage-control-btn.pay-warning{
  background: linear-gradient(180deg, rgba(245,158,11,.25), rgba(217,119,6,.18));
  border-color: rgba(252,211,77,.45);
  color: #fde68a;
  box-shadow: 0 0 0 1px rgba(245,158,11,.12) inset;
}

/* Pago FEITO */
.stage-step.final-paid{
  background: linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color: rgba(74,222,128,.40);
  color: #dcfce7;
}


/* RELATÓRIOS PROFISSIONAL */
#relatorios-page .report-hero,
#relatorios-page .relatorios-hero{
  background: linear-gradient(135deg, rgba(88,28,135,.28), rgba(30,41,59,.92));
  border: 1px solid rgba(168,85,247,.24);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 18px;
  box-shadow: 0 20px 40px rgba(0,0,0,.20);
}
#relatorios-page .report-hero h2,
#relatorios-page .relatorios-hero h2{
  margin: 0 0 8px 0;
  font-size: 26px;
  font-weight: 800;
  color: #f5f3ff;
  letter-spacing: .02em;
}
#relatorios-page .report-hero p,
#relatorios-page .relatorios-hero p{
  margin: 0;
  color: #d8b4fe;
  opacity: .95;
}
#relatorios-page .stats-grid,
#relatorios-page .reports-grid{
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
#relatorios-page .stat-card,
#relatorios-page .report-card,
#relatorios-page .relatorio-card{
  background: linear-gradient(180deg, rgba(15,23,42,.94), rgba(30,41,59,.90));
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 14px 28px rgba(0,0,0,.18);
}
#relatorios-page .stat-card .label,
#relatorios-page .report-card .label,
#relatorios-page .relatorio-card .label{
  display:block;
  font-size:12px;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:#c4b5fd;
  margin-bottom:8px;
}
#relatorios-page .stat-card .value,
#relatorios-page .report-card .value,
#relatorios-page .relatorio-card .value{
  font-size:28px;
  font-weight:800;
  color:#fff;
  line-height:1.1;
}
#relatorios-page .report-panel,
#relatorios-page .relatorios-panel,
#relatorios-page .table-card{
  background: rgba(15,23,42,.78);
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 12px 24px rgba(0,0,0,.14);
}
#relatorios-page table{
  width:100%;
  border-collapse:separate;
  border-spacing:0;
  overflow:hidden;
  border-radius:14px;
}
#relatorios-page thead th{
  background: rgba(88,28,135,.28);
  color:#f5f3ff;
  font-size:12px;
  text-transform:uppercase;
  letter-spacing:.08em;
  padding:12px 10px;
  border-bottom:1px solid rgba(168,85,247,.22);
}
#relatorios-page tbody td{
  background: rgba(15,23,42,.72);
  padding:12px 10px;
  border-bottom:1px solid rgba(148,163,184,.08);
}
#relatorios-page tbody tr:hover td{
  background: rgba(30,41,59,.92);
}
#relatorios-page .small-btn,
#relatorios-page button{
  border-radius: 12px;
}


/* BACKUPS */
.REMOVED_BACKUP{
  background: linear-gradient(180deg, rgba(15,23,42,.92), rgba(30,41,59,.88));
  border:1px solid rgba(148,163,184,.14);
  border-radius:18px;
  padding:16px;
  margin-top:16px;
  box-shadow:0 12px 24px rgba(0,0,0,.16);
}
.REMOVED_BACKUP h3{
  margin:0 0 8px 0;
}
.backup-status-line{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin:10px 0 14px 0;
  color:#cbd5e1;
  font-size:13px;
}
.backup-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}
.backup-actions button,
.backup-actions label{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:38px;
  border-radius:999px;
  padding:8px 14px;
  font-size:12px;
  font-weight:800;
  border:1px solid rgba(255,255,255,.10);
  white-space:nowrap;
  cursor:pointer;
}
.backup-btn-export{
  background:linear-gradient(180deg, rgba(37,99,235,.26), rgba(29,78,216,.18));
  border-color:rgba(96,165,250,.42);
  color:#dbeafe;
}
.backup-btn-import{
  background:linear-gradient(180deg, rgba(168,85,247,.22), rgba(126,34,206,.16));
  border-color:rgba(216,180,254,.32);
  color:#f3e8ff;
}
.backup-btn-weekly{
  background:linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color:rgba(74,222,128,.40);
  color:#dcfce7;
}
.backup-file-input{display:none;}


/* BACKUPS VISUAL PRO */
.REMOVED_BACKUP{
  position: relative;
  overflow: hidden;
}
.REMOVED_BACKUP::before{
  content:'';
  position:absolute;
  inset:0;
  background: radial-gradient(circle at top right, rgba(59,130,246,.16), transparent 35%),
              radial-gradient(circle at bottom left, rgba(168,85,247,.14), transparent 30%);
  pointer-events:none;
}
.REMOVED_BACKUP > *{
  position:relative;
  z-index:1;
}
.backup-tools-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  margin-bottom:14px;
}
.backup-tools-title{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.backup-tools-title h3{
  margin:0;
  font-size:20px;
  color:#fff;
  letter-spacing:.02em;
}
.backup-tools-title p{
  margin:0;
  font-size:13px;
  color:#cbd5e1;
}
.backup-pill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:32px;
  padding:6px 12px;
  border-radius:999px;
  font-size:12px;
  font-weight:800;
  letter-spacing:.02em;
  color:#dbeafe;
  border:1px solid rgba(96,165,250,.28);
  background:linear-gradient(180deg, rgba(37,99,235,.18), rgba(29,78,216,.12));
}
.backup-status-grid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(220px,1fr));
  gap:12px;
  margin:14px 0 16px 0;
}
.backup-status-card{
  background:rgba(15,23,42,.62);
  border:1px solid rgba(148,163,184,.12);
  border-radius:16px;
  padding:14px;
  box-shadow:0 10px 20px rgba(0,0,0,.10);
}
.backup-status-card .label{
  display:block;
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:#a78bfa;
  margin-bottom:8px;
}
.backup-status-card .value{
  display:block;
  font-size:18px;
  font-weight:800;
  color:#fff;
  line-height:1.15;
}
.backup-actions{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap:10px;
}
.backup-actions button,
.backup-actions label{
  width:100%;
  justify-content:center;
}
@media (max-width: 768px){
  .backup-tools-header{
    flex-direction:column;
    align-items:flex-start;
  }
}


/* BACKUPS PREMIUM */
.backups-premium-wrap{
  margin-top:22px;
  background: linear-gradient(135deg, rgba(88,28,135,.22), rgba(15,23,42,.94));
  border: 1px solid rgba(168,85,247,.22);
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 18px 36px rgba(0,0,0,.18);
}
.backups-premium-head{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:14px;
  margin-bottom:14px;
}
.backups-premium-head h3{
  margin:0 0 6px 0;
  font-size:22px;
  font-weight:800;
  color:#f5f3ff;
}
.backups-premium-head p{
  margin:0;
  color:#d8b4fe;
  font-size:13px;
}
.backups-premium-pill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:34px;
  padding:6px 12px;
  border-radius:999px;
  font-size:12px;
  font-weight:800;
  letter-spacing:.03em;
  color:#f3e8ff;
  background:linear-gradient(180deg, rgba(168,85,247,.24), rgba(126,34,206,.16));
  border:1px solid rgba(216,180,254,.32);
}
.backups-premium-grid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(220px,1fr));
  gap:12px;
  margin-bottom:14px;
}
.backups-premium-stat{
  background:rgba(15,23,42,.68);
  border:1px solid rgba(148,163,184,.12);
  border-radius:16px;
  padding:14px;
  box-shadow:0 10px 20px rgba(0,0,0,.10);
}
.backups-premium-stat .label{
  display:block;
  margin-bottom:8px;
  color:#c4b5fd;
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:.08em;
}
.backups-premium-stat .value{
  display:block;
  color:#fff;
  font-size:20px;
  font-weight:800;
}
.backups-premium-actions{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(190px,1fr));
  gap:10px;
}
.backups-premium-btn,
.backups-premium-actions label{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:42px;
  width:100%;
  border-radius:14px;
  padding:10px 14px;
  font-size:13px;
  font-weight:800;
  border:1px solid rgba(255,255,255,.10);
  cursor:pointer;
  transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;
  white-space:nowrap;
}
.backups-premium-btn:hover,
.backups-premium-actions label:hover{
  transform:translateY(-1px);
}
.backups-premium-btn.export{
  background:linear-gradient(180deg, rgba(37,99,235,.24), rgba(29,78,216,.16));
  border-color:rgba(96,165,250,.36);
  color:#dbeafe;
}
.backups-premium-btn.download{
  background:linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color:rgba(74,222,128,.36);
  color:#dcfce7;
}
.backups-premium-actions label{
  background:linear-gradient(180deg, rgba(168,85,247,.22), rgba(126,34,206,.16));
  border-color:rgba(216,180,254,.32);
  color:#f3e8ff;
}
.backups-hidden-input{display:none;}
@media (max-width: 768px){
  .backups-premium-head{flex-direction:column}
}


/* INDICADOR VISUAL BACKUP */
.backup-indicator-card{
  margin-top:18px;
  background:linear-gradient(180deg, rgba(15,23,42,.94), rgba(30,41,59,.90));
  border:1px solid rgba(148,163,184,.14);
  border-radius:18px;
  padding:16px;
  box-shadow:0 12px 24px rgba(0,0,0,.16);
}
.backup-indicator-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}
.backup-indicator-head h3{
  margin:0;
  font-size:18px;
  font-weight:800;
  color:#fff;
}
.backup-indicator-sub{
  margin:4px 0 0 0;
  color:#cbd5e1;
  font-size:13px;
}
.backup-indicator-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:34px;
  padding:6px 12px;
  border-radius:999px;
  font-size:12px;
  font-weight:800;
  letter-spacing:.03em;
  border:1px solid rgba(255,255,255,.10);
}
.backup-indicator-badge.ok{
  background:linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color:rgba(74,222,128,.40);
  color:#dcfce7;
}
.backup-indicator-badge.warn{
  background:linear-gradient(180deg, rgba(239,68,68,.20), rgba(185,28,28,.14));
  border-color:rgba(252,165,165,.32);
  color:#fee2e2;
}
.backup-indicator-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:12px;
  margin:12px 0 14px 0;
}
.backup-indicator-stat{
  background:rgba(15,23,42,.62);
  border:1px solid rgba(148,163,184,.12);
  border-radius:14px;
  padding:12px;
}
.backup-indicator-stat .label{
  display:block;
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:#a78bfa;
  margin-bottom:8px;
}
.backup-indicator-stat .value{
  display:block;
  color:#fff;
  font-size:18px;
  font-weight:800;
}
.backup-indicator-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}
.backup-indicator-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:40px;
  border-radius:14px;
  padding:10px 14px;
  font-size:13px;
  font-weight:800;
  border:1px solid rgba(255,255,255,.10);
  cursor:pointer;
  white-space:nowrap;
}
.backup-indicator-btn.primary{
  background:linear-gradient(180deg, rgba(37,99,235,.24), rgba(29,78,216,.16));
  border-color:rgba(96,165,250,.36);
  color:#dbeafe;
}
.backup-indicator-btn.secondary{
  background:linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color:rgba(74,222,128,.36);
  color:#dcfce7;
}
.backup-indicator-btn.import{
  background:linear-gradient(180deg, rgba(168,85,247,.22), rgba(126,34,206,.16));
  border-color:rgba(216,180,254,.32);
  color:#f3e8ff;
}
.backup-hidden-file{display:none;}


/* EXTRA RELATÓRIOS PROFISSIONAIS */
.relatorios-extra-wrap{
  margin-top:18px;
  display:grid;
  gap:16px;
}
.relatorios-extra-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}
.relatorios-extra-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:42px;
  border-radius:14px;
  padding:10px 14px;
  font-size:13px;
  font-weight:800;
  border:1px solid rgba(255,255,255,.10);
  cursor:pointer;
  white-space:nowrap;
}
.relatorios-extra-btn.primary{
  background:linear-gradient(180deg, rgba(37,99,235,.24), rgba(29,78,216,.16));
  border-color:rgba(96,165,250,.36);
  color:#dbeafe;
}
.relatorios-extra-btn.secondary{
  background:linear-gradient(180deg, rgba(34,197,94,.22), rgba(22,163,74,.16));
  border-color:rgba(74,222,128,.36);
  color:#dcfce7;
}
.relatorios-extra-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:14px;
}
.relatorios-extra-card{
  background:linear-gradient(180deg, rgba(15,23,42,.94), rgba(30,41,59,.90));
  border:1px solid rgba(148,163,184,.14);
  border-radius:18px;
  padding:16px;
  box-shadow:0 12px 24px rgba(0,0,0,.16);
}
.relatorios-extra-card h3{
  margin:0 0 12px 0;
  font-size:16px;
  font-weight:800;
  color:#fff;
}
.relatorios-extra-stat{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.relatorios-extra-stat .label{
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:#a78bfa;
}
.relatorios-extra-stat .value{
  font-size:24px;
  font-weight:800;
  color:#fff;
}
.relatorios-list{
  display:grid;
  gap:10px;
}
.relatorios-list-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  background:rgba(15,23,42,.62);
  border:1px solid rgba(148,163,184,.12);
  border-radius:14px;
  padding:12px;
}
.relatorios-list-item .meta{
  display:flex;
  flex-direction:column;
  gap:4px;
  min-width:0;
}
.relatorios-list-item .title{
  color:#fff;
  font-weight:700;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.relatorios-list-item .sub{
  color:#cbd5e1;
  font-size:12px;
}
.relatorios-list-item .amount{
  color:#dcfce7;
  font-weight:800;
  white-space:nowrap;
}
.relatorios-empty{
  color:#94a3b8;
  font-size:13px;
}
@media (max-width:768px){
  .relatorios-list-item{
    align-items:flex-start;
    flex-direction:column;
  }
}


/* CAMPOS SÓ ADMIN MESTRE NO ADICIONAR */
.master-edit-only.is-hidden-by-role{
  display:none !important;
}


/* CAMPOS AVANÇADOS DO TRABALHO */
.field-hidden-by-role{
  display:none !important;
}

</style></head><body>${bodyHtml}</body></html>`); win.document.close(); setTimeout(()=>{ win.focus(); win.print(); },300); }


function getAgendaDate(t){
  return t?.dataInicio || t?.dataFim || '';
}
function startOfDay(value){
  const d = new Date(value);
  if(isNaN(d)) return null;
  d.setHours(0,0,0,0);
  return d;
}
function formatAgendaHeader(value){
  const d = startOfDay(value);
  if(!d) return 'Sem data';
  return d.toLocaleDateString('pt-PT', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
}
function isOpenEstado(estado){
  return ['Pendente','Em curso','Aguardar peça'].includes(normalizeEstado(estado));
}
function getCalendarRows(){
  const search = ($('calendarSearch')?.value || '').trim().toLowerCase();
  const range = $('calendarRangeFilter')?.value || 'all';
  const state = $('calendarStateFilter')?.value || '';
  const today = startOfDay(new Date());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return trabalhos
    .map(t => ({ ...normalizeTrabalhoStateShape(t), agendaDate: getAgendaDate(t) }))
    .filter(t => t.agendaDate)
    .filter(t => {
      const hay = [t.workCode, t.cliente, t.tipoTrabalho, t.contacto, t.descricao, t.estado].join(' ').toLowerCase();
      if(search && !hay.includes(search)) return false;
      if(state && normalizeEstado(t.estado) !== state) return false;
      const d = startOfDay(t.agendaDate);
      if(!d) return false;
      if(range === 'today') return d.getTime() === today.getTime();
      if(range === 'week') return d >= today && d <= weekEnd;
      if(range === 'late') return d < today && isOpenEstado(t.estado);
      if(range === 'open') return isOpenEstado(t.estado);
      return true;
    })
    .sort((a,b) => {
      const ad = startOfDay(a.agendaDate)?.getTime() || 0;
      const bd = startOfDay(b.agendaDate)?.getTime() || 0;
      if(ad !== bd) return ad - bd;
      return getWorkCodeNumber(a.workCode) - getWorkCodeNumber(b.workCode);
    });
}
function renderCalendario(){
  const wrap = $('calendarAgenda');
  const stats = $('calendarStats');
  if(!wrap || !stats) return;

  const rows = getCalendarRows();
  const today = startOfDay(new Date());
  const lateCount = trabalhos.filter(t => {
    const d = startOfDay(getAgendaDate(t));
    return d && d < today && isOpenEstado(t.estado);
  }).length;
  const todayCount = trabalhos.filter(t => {
    const d = startOfDay(getAgendaDate(t));
    return d && d.getTime() === today.getTime();
  }).length;
  const openCount = trabalhos.filter(t => isOpenEstado(t.estado)).length;

  stats.innerHTML = `
    <div class="calendar-stat"><span>Serviços hoje</span><strong>${todayCount}</strong></div>
    <div class="calendar-stat"><span>Em atraso</span><strong>${lateCount}</strong></div>
    <div class="calendar-stat"><span>Trabalhos abertos</span><strong>${openCount}</strong></div>
    <div class="calendar-stat"><span>Resultados atuais</span><strong>${rows.length}</strong></div>
  `;

  if(!rows.length){
    wrap.innerHTML = '<div class="calendar-empty">Sem trabalhos para mostrar no calendário.</div>';
    return;
  }

  const groups = rows.reduce((acc, t) => {
    const key = t.agendaDate;
    if(!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  wrap.innerHTML = Object.keys(groups).sort((a,b)=> (startOfDay(a)?.getTime()||0) - (startOfDay(b)?.getTime()||0)).map(key => {
    const items = groups[key];
    return `
      <div class="calendar-day">
        <div class="calendar-day-head">
          <h4>${escapeHtml(formatAgendaHeader(key))}</h4>
          <span class="mini-label">${items.length} trabalho(s)</span>
        </div>
        <div class="calendar-day-items">
          ${items.map(t => `
            <div class="calendar-item">
              <div class="calendar-when">
                <strong>${escapeHtml(t.workCode || '-')}</strong>
                <small>${fmtDate(t.agendaDate)}</small>
              </div>
              <div class="calendar-main">
                <div class="calendar-title-line">
                  <strong>${escapeHtml(t.cliente || '-')}</strong>
                  <span class="badge" data-state="${escapeHtml(t.estado || '-')}">${escapeHtml(t.estado || '-')}</span>
                </div>
                <div>${escapeHtml(t.tipoTrabalho || '-')}</div>
                <div class="calendar-meta">${escapeHtml(t.contacto || 'Sem contacto')} • Valor: ${euro(t.valorPago ?? t.valor ?? 0)}</div>
                ${(t.descricao || '').trim() ? `<div class="calendar-meta">${escapeHtml(t.descricao)}</div>` : ''}
              </div>
              <div class="row-actions">
                ${hasRolePermission('manage_work_orders') ? `<button class="small-btn" onclick="editTrabalho('${t.id}')">Editar</button>` : ''}
                <button class="small-btn info" onclick="window.showDesc('${t.id}')">Descrição</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderDashboard(){
  const totalTrabalhos = trabalhos.length;
  const emAndamento = trabalhos.filter(t=>['Pendente','Em curso','Aguardar peça'].includes(normalizeEstado(t.estado))).length;
  const concluidos = trabalhos.filter(t=>['Concluído','Pago','Entregue'].includes(normalizeEstado(t.estado))).length;
  const totalFaturado = trabalhos.reduce((s,t)=>s+Number(t.valor||0),0);
  const totalPago = pagamentos.reduce((s,p)=>s+Number(p.valor||0),0);
  const clientesAtivos = new Set(trabalhos.map(t=>(t.cliente||'').trim()).filter(Boolean)).size;

  $('statTotalTrabalhos').textContent = totalTrabalhos;
  $('statEmAndamento').textContent = emAndamento;
  $('statConcluidos').textContent = concluidos;
  $('statTotalFaturado').textContent = euro(totalFaturado);

  const recentWrap=$('recentTrabalhos');
  recentWrap.innerHTML = !trabalhos.length
    ? '<div class="recent-item">Ainda não tens trabalhos registados.</div>'
    : [...trabalhos].slice(-5).reverse().map(t=>`
      <div class="recent-item">
        <div class="mini-label badge" data-state="${escapeHtml(t.estado||'Sem estado')}">${escapeHtml(t.estado||'Sem estado')}</div>
        <strong>${escapeHtml(t.cliente||'-')}</strong>
        <div>${escapeHtml(t.tipoTrabalho||'-')}</div>
        <div class="recent-meta">${euro(t.valorPago ?? t.valor ?? 0)} • ${fmtDate(t.dataInicio)} → ${fmtDate(t.dataFim)}</div>
      </div>`).join('');

  const monthMap={};
  trabalhos.forEach(t=>{
    if(!t.dataInicio) return;
    const d=new Date(t.dataInicio);
    if(isNaN(d)) return;
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthMap[key]=(monthMap[key]||0)+Number(t.valor||0);
  });
  const entries=Object.entries(monthMap).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
  const max=Math.max(...entries.map(([,v])=>v),1);
  $('monthlyBars').innerHTML = entries.length
    ? entries.map(([m,v])=>`<div class="bar-row"><span>${m}</span><div class="bar-track"><div class="bar-fill" style="width:${(v/max)*100}%"></div></div><strong>${euro(v)}</strong></div>`).join('')
    : '<div class="recent-item">Sem dados mensais ainda.</div>';

  const chip = document.querySelector('.hero-chip strong');
  if(chip){
    chip.textContent = totalTrabalhos ? 'Empresa Ativa' : 'Online';
    chip.className = totalTrabalhos ? 'status-ok' : 'status-warn';
  }
}


function renderAlerts(){
  const pend = trabalhos.filter(t=>['Pendente','Agendado'].includes(normalizeEstado(t.estado))).length;
  const andam = trabalhos.filter(t=>['Em curso','Aguardar peça'].includes(normalizeEstado(t.estado))).length;
  const pagos = trabalhos.filter(t=>t.paymentStatus==='Pago' || t.estado==='Pago').length;
  const totalPago = pagamentos.reduce((s,p)=>s+Number(p.valor||0),0);
  const clientesAtivos = new Set(trabalhos.map(t=>(t.cliente||'').trim()).filter(Boolean)).size;

  const wrap = $('alertCards');
  if(!wrap) return;
  wrap.innerHTML = `
    <div class="alert-card"><span class="mini-label">Pendentes</span><strong>${pend}</strong><p>Trabalhos ainda por arrancar.</p></div>
    <div class="alert-card"><span class="mini-label">Em andamento</span><strong>${andam}</strong><p>Serviços que precisam de acompanhamento.</p></div>
    <div class="alert-card"><span class="mini-label">Pagos</span><strong>${pagos}</strong><p>Trabalhos já fechados com pagamento registado.</p></div>
    <div class="alert-card"><span class="mini-label">Recebido</span><strong>${euro(totalPago)}</strong><p>Total recebido em pagamentos registados.</p></div>
    <div class="alert-card"><span class="mini-label">Clientes ativos</span><strong>${clientesAtivos}</strong><p>Clientes com trabalhos registados.</p></div>
  `;
}

function trabalhoActions(t){
  const showInvoice = (t.invoiceType || 'Com Fatura') === 'Com Fatura';
  const canEdit = hasRolePermission('manage_work_orders');
  const canDelete = hasRolePermission('manage_work_orders');
  const hasDesc = ((t.descricao || t.descrição || t.description || t.desc || '')).trim().length > 0;
  const flowButtons = buildFlowButtons(t);
  const descButton = hasDesc
    ? `<button class="pipeline-like-btn desc-btn" onclick="window.showDesc('${t.id}')">Com Descrição</button>`
    : `<span class="desc-status-btn no-desc">Sem Descrição</span>`;

  return `
    <div class="enterprise-actions">
      ${descButton}
      ${showInvoice ? `<button class="pipeline-like-btn fatura-btn" onclick="generateInvoice('${t.id}')">Fatura</button>` : `<span class="pipeline-like-btn fatura-disabled">Fatura</span>`}
      ${canEdit ? `<button class="pipeline-like-btn edit-btn" onclick="editTrabalho('${t.id}')">Editar</button>` : '<span></span>'}
      ${canDelete ? `<button class="pipeline-like-btn delete-btn" onclick="deleteTrabalho('${t.id}')">Apagar</button>` : '<span></span>'}
      <div class="stage-flow">${flowButtons}</div>
    </div>
  `;
}

function clienteActions(c){
  const history=`<button class="small-btn" onclick="openClientHistory('${c.id}')">Histórico</button>`;
  const pdf=`<button class="small-btn" onclick="pdfCliente('${c.id}')">PDF</button>`;
  return !hasRolePermission('manage_clients') ? `${history}${pdf}` : `${history}${pdf}<button class="small-btn" onclick="editCliente('${c.id}')">Editar</button><button class="small-btn danger" onclick="deleteCliente('${c.id}')">Apagar</button>`;
}
function pagamentoActions(p){
  const pdf=`<button class="small-btn" onclick="pdfPagamento('${p.id}')">PDF</button>`;
  return !hasRolePermission('manage_payments') ? pdf : `${pdf}<button class="small-btn" onclick="editPagamento('${p.id}')">Editar</button><button class="small-btn danger" onclick="deletePagamento('${p.id}')">Apagar</button>`;
}
function renderTrabalhos(){
  const term=$('searchTrabalhos').value.trim().toLowerCase();
  const globalTerm=($('globalSearch')?.value||'').trim().toLowerCase();
  const estado=$('filterEstado').value;
  const rows=trabalhos.filter(t=>{
    const hay=[t.workCode,t.cliente,t.tipoTrabalho,t.contacto,t.descricao,t.estado,t.invoiceType].join(' ').toLowerCase();
    return (!term||hay.includes(term))&&(!globalTerm||hay.includes(globalTerm))&&(!estado||t.estado===estado);
  }).sort((a,b)=>getWorkCodeNumber(b.workCode)-getWorkCodeNumber(a.workCode));
  $('trabalhosTableBody').innerHTML = rows.length ? rows.map(t=>{
    const invoiceType = t.invoiceType || 'Com Fatura';
    const invoiceClass = invoiceType === 'Sem Fatura' ? 'sem' : 'com';
    const effectiveEstado = t.paymentStatus === 'Pago' ? 'Pago' : (t.estado || '-');
    return `<tr><td><strong>${escapeHtml(t.workCode||'-')}</strong></td><td>${escapeHtml(t.cliente||'-')}</td><td>${escapeHtml(t.tipoTrabalho||'-')}</td><td>${euro(t.valorPago ?? t.valor ?? 0)}</td><td>${fmtDate(t.dataInicio)}</td><td>${fmtDate(t.dataFim)}</td><td><div class="status-cell-inline"><span class="badge" data-state="${escapeHtml(effectiveEstado)}">${escapeHtml(effectiveEstado)}</span></div></td><td><span class="invoice-badge ${invoiceClass}">${escapeHtml(invoiceType)}</span></td><td class="actions-cell">${trabalhoActions(t)}</td></tr>`;
  }).join('') : '<tr><td colspan="9">Sem resultados.</td></tr>';
}
function renderClientes(){
  const term=$('searchClientes').value.trim().toLowerCase();
  const globalTerm=($('globalSearch')?.value||'').trim().toLowerCase();
  const rows=clientes.filter(c=>{
    const hay=[c.nome,c.telefone,c.email,c.nif,c.morada].join(' ').toLowerCase();
    return (!term||hay.includes(term))&&(!globalTerm||hay.includes(globalTerm))
  });
  $('clientesTableBody').innerHTML = rows.length ? rows.slice().reverse().map(c=>`<tr><td>${escapeHtml(c.nome||'-')}</td><td>${escapeHtml(c.telefone||'-')}</td><td>${escapeHtml(c.email||'-')}</td><td>${escapeHtml(c.nif||'-')}</td><td><div class="row-actions">${clienteActions(c)}</div></td></tr>`).join('') : '<tr><td colspan="5">Sem clientes registados.</td></tr>';
}
let pagamentosSortState = { key: 'data', dir: 'desc' };
function getPagamentoSortValue(p, key) {
  switch (key) {
    case 'cliente': return String(p.cliente || '').toLowerCase();
    case 'referencia': return String(p.referencia || '').toLowerCase();
    case 'data': {
      const raw = p.workDate || p.data || '';
      const ts = raw ? new Date(raw).getTime() : 0;
      return Number.isFinite(ts) ? ts : 0;
    }
    case 'valor': return Number(p.valor || 0);
    case 'metodo': return String(p.metodo || 'Manual').toLowerCase();
    case 'invoiceType': return String(p.invoiceType || 'Com Fatura').toLowerCase();
    default: return String(p[key] || '').toLowerCase();
  }
}
function updatePagamentosSortUI() {
  document.querySelectorAll('.sortable-th-btn').forEach((btn)=>{
    const onclick = btn.getAttribute('onclick') || '';
    const match = onclick.match(/setPagamentosSort\('([^']+)'\)/);
    const key = match ? match[1] : '';
    const arrow = btn.querySelector('.sort-arrow');
    const active = key === pagamentosSortState.key;
    btn.classList.toggle('active', active);
    if (arrow) arrow.textContent = active ? (pagamentosSortState.dir === 'asc' ? '↑' : '↓') : '↕';
  });
}
window.setPagamentosSort = function(key) {
  if (pagamentosSortState.key === key) {
    pagamentosSortState.dir = pagamentosSortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    pagamentosSortState.key = key;
    pagamentosSortState.dir = key === 'data' || key === 'valor' ? 'desc' : 'asc';
  }
  renderPagamentos();
};

function renderPagamentos() {
  const tbody = $('pagamentosTableBody');
  if (!tbody) return;
  const rows = pagamentos.slice().sort((a, b) => {
    const av = getPagamentoSortValue(a, pagamentosSortState.key);
    const bv = getPagamentoSortValue(b, pagamentosSortState.key);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), 'pt', { numeric: true, sensitivity: 'base' });
    if (cmp === 0) {
      const fallbackA = new Date(a.workDate || a.data || 0).getTime() || 0;
      const fallbackB = new Date(b.workDate || b.data || 0).getTime() || 0;
      cmp = fallbackA - fallbackB;
    }
    return pagamentosSortState.dir === 'asc' ? cmp : -cmp;
  });

  updatePagamentosSortUI();

  tbody.innerHTML = rows.length
    ? rows.map((p) => {
      const invoiceType = p.invoiceType || 'Com Fatura';
      const invoiceClass = invoiceType === 'Sem Fatura' ? 'sem' : 'com';
      return `
      <tr>
        <td>${escapeHtml(p.cliente || '-')}</td>
        <td>${escapeHtml(p.referencia || '-')}</td>
        <td>${fmtDate(p.workDate || p.data || '')}</td>
        <td>${euro(p.valor || 0)}</td>
        <td>${escapeHtml(p.metodo || 'Manual')}</td>
        <td><span class="invoice-badge ${invoiceClass}">${escapeHtml(invoiceType)}</span></td>
        <td><div class="row-actions">${hasRolePermission('manage_payments') ? `<button class="small-btn danger" onclick="deletePagamento('${p.id}')">Apagar</button>` : ''}</div></td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="7">Sem pagamentos registados.</td></tr>';
}
function renderRelatorios() {
  const map = {};

  trabalhos.forEach((t) => {
    const src = t.dataInicio || t.dataFim;
    if (!src) return;

    const d = new Date(src);
    if (Number.isNaN(d.getTime())) return;

    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cliente = t.cliente || 'Sem Cliente';
    const key = `${cliente}__${mes}`;

    if (!map[key]) {
      map[key] = {
        cliente,
        mes,
        total: 0,
        trabalhos: 0
      };
    }

    map[key].total += Number(t.valor || 0);
    map[key].trabalhos += 1;
  });

  const wrap = $('resumoMensal');
  if (!wrap) return;

  const entries = Object.values(map).sort((a, b) => {
    if (a.mes === b.mes) return a.cliente.localeCompare(b.cliente);
    return b.mes.localeCompare(a.mes);
  });

  wrap.innerHTML = entries.length
    ? entries
        .map(
          (r) => `
            <div class="report-card">
              <div class="mini-label">${escapeHtml(r.mes)}</div>
              <div>${escapeHtml(r.cliente)}</div>
              <strong>${euro(r.total)}</strong>
              <div class="recent-meta">Trabalhos: ${r.trabalhos}</div>
            </div>
          `
        )
        .join('')
    : '<div class="report-card">Sem dados para relatório.</div>';
}
function renderAll(){ if(!currentRole) return; setRoleUI(); populateClientOptions(); populateClientOptions(); renderDashboard(); renderAlerts(); renderDashboardAgenda(); renderTrabalhos(); renderClientes(); renderPagamentos(); renderRelatorios();
  try{ renderAdvancedReports(); }catch(e){}
  renderManagedUsers();
  updateWorkCodePreview();
  updateWorkCodePreview();
  renderMobileCards(); }

$('searchTrabalhos')?.addEventListener('input', ()=>{ renderTrabalhos(); renderMobileCards(); });
$('filterEstado')?.addEventListener('change', ()=>{ renderTrabalhos(); renderMobileCards(); });
$('searchClientes')?.addEventListener('input', ()=>{ renderClientes(); renderMobileCards(); });
$('globalSearch')?.addEventListener('input', ()=>{ renderTrabalhos(); renderClientes(); renderPagamentos(); renderRelatorios();
  try{ renderAdvancedReports(); }catch(e){} renderMobileCards(); });

$('clearTrabalhoBtn')?.addEventListener('click', ()=>{
  $('trabalhoForm')?.reset();
  if($('trabalhoId')) $('trabalhoId').value='';
  if($('trabalhoInvoiceType')) $('trabalhoInvoiceType').value='Com Fatura';
  if($('cliente')) $('cliente').value='';
  if($('contacto')) $('contacto').value='';
  if($('workCodeDisplay')) $('workCodeDisplay').value = nextTrabalhoIdPreview();
  try{ updateTrabalhoFieldVisibility(); }catch(e){}
  updateTrabalhoAdvancedFields();
});
$('clearClienteBtn')?.addEventListener('click', ()=>{
  $('clienteForm')?.reset();
  if($('clienteId')) $('clienteId').value='';
});


$('trabalhoForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!adminGuard('manage_work_orders', 'Sem permissão para gerir trabalhos.')) return;

  const existingId = $('trabalhoId').value;
  const manualWorkCode = ($('workCodeDisplay')?.value || '').trim();
  const original = existingId ? trabalhos.find(x => x.id === existingId) : null;

  let finalWorkCode = '';
  if(existingId){
    finalWorkCode = (isMasterAdmin() && manualWorkCode) ? manualWorkCode : (original?.workCode || manualWorkCode || nextTrabalhoIdPreview());
  }else{
    finalWorkCode = (isMasterAdmin() && manualWorkCode) ? manualWorkCode : nextTrabalhoId();
  }

  const item={
    id: existingId || genId('trab'),
    workCode: finalWorkCode,
    cliente:$('cliente').value.trim(),
    contacto:$('contacto').value.trim(),
    tipoTrabalho:$('tipoTrabalho').value.trim(),
    valor:Number($('valor').value||0),
    dataInicio:$('dataInicio').value,
    dataFim:$('dataFim').value,
    estado:$('estado').value,
    invoiceType:$('trabalhoInvoiceType') ? $('trabalhoInvoiceType').value : 'Com Fatura',
    descricao:$('descricao').value.trim()
  };

  if(!item.cliente || !item.tipoTrabalho){
    alert('Preenche cliente e tipo de trabalho.');
    return;
  }

  const i=trabalhos.findIndex(x=>x.id===item.id);
  if(i>=0) trabalhos[i]=item; else trabalhos.push(item);
  refreshLastTrabIdFromWorks();

  saveLocal();
  try{ await upsertRemote('trabalhos', item); }catch(err){ console.error(err); setSyncMessage('Erro a gravar no Firebase', 'bad'); }

  $('trabalhoForm').reset();
  $('trabalhoId').value='';
  if($('trabalhoInvoiceType')) $('trabalhoInvoiceType').value='Com Fatura';
  if($('cliente')) $('cliente').value='';
  if($('contacto')) $('contacto').value='';
  if($('workCodeDisplay')) $('workCodeDisplay').value = nextTrabalhoIdPreview();
  try{ updateTrabalhoFieldVisibility(); }catch(e){}
  updateTrabalhoAdvancedFields();

  renderAll();
  switchTab('trabalhos');
});

$('clienteForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!adminGuard('manage_work_orders', 'Sem permissão para gerir trabalhos.')) return;
  const item={
    id:$('clienteId').value || genId('cli'),
    nome:$('clienteNome').value.trim(),
    telefone:$('clienteTelefone').value.trim(),
    email:$('clienteEmail').value.trim(),
    nif:$('clienteNif').value.trim(),
    morada:$('clienteMorada').value.trim()
  };
  if(!item.nome){ alert('Preenche o nome do cliente.'); return; }
  const i=clientes.findIndex(x=>x.id===item.id);
  if(i>=0) clientes[i]=item; else clientes.push(item);
  saveLocal();
  try{ await upsertRemote('clientes', item); }catch(err){ console.error(err); setSyncMessage('Erro a gravar no Firebase', 'bad'); }
  $('clienteForm').reset();
  $('clienteId').value='';
  renderAll();
  switchTab('clientes');
});


window.editTrabalho = function(id){
  if(!adminGuard('manage_work_orders', 'Sem permissão para gerir trabalhos.')) return;
  const t=trabalhos.find(x=>x.id===id);
  if(!t) return;
  $('trabalhoId').value=t.id;
  if($('workCodeDisplay')) $('workCodeDisplay').value = t.workCode || '';
  populateClientOptions(t.cliente || '');
  if($('contacto')) $('contacto').value=t.contacto||'';
  $('tipoTrabalho').value=t.tipoTrabalho||'';
  $('valor').value=t.valor||'';
  $('dataInicio').value=t.dataInicio||'';
  $('dataFim').value=t.dataFim||'';
  $('estado').value=normalizeEstado(t.estado||'Pendente');
  if($('trabalhoInvoiceType')) $('trabalhoInvoiceType').value=t.invoiceType||'Com Fatura';
  $('descricao').value=t.descricao||'';
  updateTrabalhoAdvancedFields();
  switchTab('adicionar');
};
window.deleteTrabalho = async function(id){
  if(!adminGuard('manage_work_orders', 'Sem permissão para gerir trabalhos.')) return;
  if(!confirm('Apagar este trabalho?')) return;
  try{
    await removeRemote('trabalhos', id);
    trabalhos = trabalhos.filter(x=>x.id!==id);
    saveLocal();
    renderAll();
    forceAppRefresh();
    forceAppRefresh();
  }catch(err){
    console.error(err);
    setSyncMessage('Erro a apagar no Firebase', 'bad');
    alert(`Não foi possível apagar na Firebase. ${err?.code ? '(' + err.code + ')' : ''}`.trim());
  }
};
window.editCliente = function(id){
  if(!adminGuard('manage_work_orders', 'Sem permissão para gerir trabalhos.')) return;
  const c=clientes.find(x=>x.id===id); if(!c) return;
  $('clienteId').value=c.id; $('clienteNome').value=c.nome||''; $('clienteTelefone').value=c.telefone||''; $('clienteEmail').value=c.email||''; $('clienteNif').value=c.nif||''; $('clienteMorada').value=c.morada||'';
  switchTab('clientes');
};
window.deleteCliente = async function(id){
  if(!adminGuard('manage_work_orders', 'Sem permissão para gerir trabalhos.')) return;
  if(!confirm('Apagar este cliente?')) return;
  try{
    await removeRemote('clientes', id);
    clientes = clientes.filter(x=>x.id!==id);
    saveLocal();
    renderAll();
  }catch(err){
    console.error(err);
    setSyncMessage('Erro a apagar no Firebase', 'bad');
    alert(`Não foi possível apagar na Firebase. ${err?.code ? '(' + err.code + ')' : ''}`.trim());
  }
};

const clientModal = $('clientModal');
$('closeClientModal').addEventListener('click', ()=> clientModal.classList.add('hidden'));
clientModal.addEventListener('click', (e)=>{ if(e.target === clientModal) clientModal.classList.add('hidden'); });

window.openClientHistory = function(id){
  const c = clientes.find(x=>x.id===id);
  if(!c) return;
  const relatedTrabalhos = trabalhos.filter(t => (t.cliente||'').trim().toLowerCase() === (c.nome||'').trim().toLowerCase());
  const relatedPagamentos = pagamentos.filter(p => (p.cliente||'').trim().toLowerCase() === (c.nome||'').trim().toLowerCase());
  const totalTrabalhos = relatedTrabalhos.reduce((s,t)=>s+Number(t.valor||0),0);
  const totalPagamentos = relatedPagamentos.reduce((s,p)=>s+Number(p.valor||0),0);

  $('clientModalTitle').textContent = `Histórico de ${c.nome || 'Cliente'}`;
  $('clientModalContent').innerHTML = `
    <div class="client-summary-grid">
      <div class="client-summary-card"><span>Total trabalhos</span><strong>${relatedTrabalhos.length}</strong></div>
      <div class="client-summary-card"><span>Total faturado</span><strong>${euro(totalTrabalhos)}</strong></div>
      <div class="client-summary-card"><span>Total pago</span><strong>${euro(totalPagamentos)}</strong></div>
      <div class="client-summary-card"><span>Estado</span><strong>${relatedPagamentos.length ? 'Com histórico' : 'Sem pagamentos'}</strong></div>
    </div>
    <section class="panel">
      <div class="panel-head"><h3>Dados do cliente</h3><span class="autobackup-badge">Histórico ativo</span></div>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr><td><strong>Nome</strong></td><td>${escapeHtml(c.nome||'-')}</td></tr>
            <tr><td><strong>Telefone</strong></td><td>${escapeHtml(c.telefone||'-')}</td></tr>
            <tr><td><strong>Email</strong></td><td>${escapeHtml(c.email||'-')}</td></tr>
            <tr><td><strong>NIF</strong></td><td>${escapeHtml(c.nif||'-')}</td></tr>
            <tr><td><strong>Morada</strong></td><td>${escapeHtml(c.morada||'-')}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>Trabalhos do cliente</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tipo</th><th>Valor</th><th>Início</th><th>Fim</th><th>Estado</th></tr></thead>
          <tbody>
            ${relatedTrabalhos.length ? relatedTrabalhos.slice().reverse().map(t=>`<tr><td>${escapeHtml(t.tipoTrabalho||'-')}</td><td>${euro(t.valorPago ?? t.valor ?? 0)}</td><td>${fmtDate(t.dataInicio)}</td><td>${fmtDate(t.dataFim)}</td><td><div class="status-cell-inline"><span class="badge" data-state="${escapeHtml(t.estado||'-')}">${escapeHtml(t.estado||'-')}</span></div></td></tr>`).join('') : '<tr><td colspan="5">Sem trabalhos registados.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>Pagamentos do cliente</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Referência</th><th>Valor</th><th>Data</th><th>Método</th></tr></thead>
          <tbody>
            ${relatedPagamentos.length ? relatedPagamentos.slice().reverse().map(p=>`<tr><td>${escapeHtml(p.referencia||'-')}</td><td>${euro(p.valor||0)}</td><td>${fmtDate(p.data)}</td><td>${escapeHtml(p.metodo||'-')}</td></tr>`).join('') : '<tr><td colspan="4">Sem pagamentos registados.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
  clientModal.classList.remove('hidden');
};

window.generateInvoice = function(id){
  const t = trabalhos.find(x=>x.id===id);
  if(!t) return;
  const invoiceNumber = `FT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  printHtml(`Fatura ${invoiceNumber}`, `
    <h1>Fatura / Serviço</h1>
    <div class="meta">Nº ${invoiceNumber}</div>
    <div class="card"><strong>Cliente:</strong> ${escapeHtml(t.cliente||'-')}</div>
    <div class="card"><strong>Tipo de trabalho:</strong> ${escapeHtml(t.tipoTrabalho||'-')}</div>
    <div class="card"><strong>Contacto:</strong> ${escapeHtml(t.contacto||'-')}</div>
    <div class="card"><strong>Data de início:</strong> ${fmtDate(t.dataInicio)}<br><strong>Data de fim:</strong> ${fmtDate(t.dataFim)}</div>
    <div class="card"><strong>Estado:</strong> ${escapeHtml(t.estado||'-')}<br><strong>Pagamento:</strong> ${escapeHtml(t.paymentStatus || 'Pendente')} ${t.dataPagamento ? '• ' + escapeHtml(fmtDate(t.dataPagamento)) : ''}</div>
    <div class="card"><strong>Descrição:</strong><br>${escapeHtml(t.descricao||'-')}</div>
    <div class="card"><strong>Total:</strong> ${euro(t.valorPago ?? t.valor ?? 0)}</div>
  `);
};

window.pdfTrabalho = function(id){ const t=trabalhos.find(x=>x.id===id); if(!t) return; const historicoHtml = normalizeHistoricoEstados(t.historicoEstados, t.estado||'Pendente', t.dataEstado || t.dataInicio || '').map(item=>`<li><strong>${escapeHtml(item.estado||'-')}</strong> — ${escapeHtml(formatDateTime(item.data))}</li>`).join(''); printHtml(`Trabalho ${t.cliente}`, `<h1>Ficha de Trabalho</h1><div class='meta'>${escapeHtml(t.cliente||'-')} • ${escapeHtml(t.tipoTrabalho||'-')}</div><div class='card'><strong>Cliente:</strong> ${escapeHtml(t.cliente||'-')}</div><div class='card'><strong>Contacto:</strong> ${escapeHtml(t.contacto||'-')}</div><div class='card'><strong>Tipo de trabalho:</strong> ${escapeHtml(t.tipoTrabalho||'-')}</div><div class='card'><strong>Valor:</strong> ${euro(t.valorPago ?? t.valor ?? 0)}</div><div class='card'><strong>Início:</strong> ${fmtDate(t.dataInicio)}<br><strong>Fim:</strong> ${fmtDate(t.dataFim)}</div><div class='card'><strong>Estado:</strong> ${escapeHtml(normalizeEstado(t.estado||'-'))}<br><strong>Pagamento:</strong> ${escapeHtml(t.paymentStatus || 'Pendente')} ${t.dataPagamento ? '• ' + escapeHtml(fmtDate(t.dataPagamento)) : ''}<br><strong>Última alteração:</strong> ${escapeHtml(formatDateTime(t.dataEstado))}</div><div class='card'><strong>Descrição:</strong><br>${escapeHtml(t.descricao||'-')}</div><div class='card'><strong>Histórico de estados:</strong><ul>${historicoHtml || '<li>Sem histórico.</li>'}</ul></div>`); };
window.pdfCliente = function(id){ const c=clientes.find(x=>x.id===id); if(!c) return; const trabalhosCliente=trabalhos.filter(t=>(t.cliente||'').trim().toLowerCase()===(c.nome||'').trim().toLowerCase()); const linhas=trabalhosCliente.map(t=>`<tr><td>${escapeHtml(t.tipoTrabalho||'-')}</td><td>${fmtDate(t.dataInicio)}</td><td>${euro(t.valorPago ?? t.valor ?? 0)}</td></tr>`).join(''); printHtml(`Cliente ${c.nome}`, `<h1>Ficha de Cliente</h1><div class='meta'>${escapeHtml(c.nome||'-')}</div><div class='card'><strong>Telefone:</strong> ${escapeHtml(c.telefone||'-')}</div><div class='card'><strong>Email:</strong> ${escapeHtml(c.email||'-')}</div><div class='card'><strong>NIF:</strong> ${escapeHtml(c.nif||'-')}</div><div class='card'><strong>Morada:</strong><br>${escapeHtml(c.morada||'-')}</div><h2>Trabalhos associados</h2><table><thead><tr><th>Tipo</th><th>Data</th><th>Valor</th></tr></thead><tbody>${linhas || '<tr><td colspan="3">Sem trabalhos associados</td></tr>'}</tbody></table>`); };
window.pdfPagamento = function(id){ const p=pagamentos.find(x=>x.id===id); if(!p) return; printHtml(`Pagamento ${p.cliente}`, `<h1>Comprovativo de Pagamento</h1><div class='meta'>${escapeHtml(p.cliente||'-')}</div><div class='card'><strong>Cliente:</strong> ${escapeHtml(p.cliente||'-')}</div><div class='card'><strong>Referência:</strong> ${escapeHtml(p.referencia||'-')}</div><div class='card'><strong>Valor:</strong> ${euro(p.valor||0)}</div><div class='card'><strong>Data:</strong> ${fmtDate(p.data)}</div><div class='card'><strong>Método:</strong> ${escapeHtml(p.metodo||'-')}</div><div class='card'><strong>Notas:</strong><br>${escapeHtml(p.notas||'-')}</div>`); };

function exportBackup(){ const payload={ exportadoEm:new Date().toISOString(), appVersion:APP_VERSION, currentUsername, currentRole, trabalhos, clientes, pagamentos }; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gestao-empresa-backup.json'; a.click(); URL.revokeObjectURL(a.href); }
$('exportBackupBtn').addEventListener('click', exportBackup);
$('exportMonthlyPdfBtn').addEventListener('click', ()=>{ const html=$('resumoMensal').innerHTML; printHtml('Relatório mensal', `<h1>Relatório Mensal</h1><div style="display:grid;gap:14px">${html}</div>`); });

loadLocal();
autoBackupInvisible();
initFirebaseSync();

window.performLogin = async function(email, password){
  await ensureAuthReady();
  const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const authUser = userCredential.user;
  const profile = getRoleProfileByEmail(authUser.email || email);
  const username = profile?.username || (String(authUser.email || email).split('@')[0] || 'user');
  const role = profile?.role || 'consulta';
  currentUserUid = authUser.uid || null;
  currentUserEmail = authUser.email || email;
  return { role, username, email: currentUserEmail, uid: currentUserUid };
};

window.performLogout = async function(){
  try{ await stopPresenceTracking(); }catch(err){ console.warn(err); }
  try{ if(firebaseAuth) await signOut(firebaseAuth); }catch(err){ console.warn('Falha no sign out Firebase:', err); }
  currentUserUid = null;
  currentUserEmail = null;
};


window.startApp = function(sessionOrRole, maybeUsername){
  const session = typeof sessionOrRole === 'object' && sessionOrRole ? sessionOrRole : { role: sessionOrRole, username: maybeUsername };
  currentRole = session.role;
  currentUsername = session.username;
  currentUserEmail = session.email || currentUserEmail || null;
  currentUserUid = session.uid || currentUserUid || null;
  loadLocal();
  setRoleUI();
  renderAll();
  initFirebaseSync()
    .then(() => startPresenceTracking())
    .catch(err => console.error(err));
};


function todayLocalDate(){
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
}
function getAgendaSmartDate(t){
  return t.dataInicio || t.dataFim || t.dataPagamento || '';
}
window.markAsPaid = async function(id, metodo='Manual', dataPagamento='', valorPersonalizado=null){
  if(!adminGuard('manage_payments', 'Sem permissão para registar pagamentos.')) return false;
  const t = trabalhos.find(x => x.id === id);
  if(!t) return false;
  const finalPaymentDate = dataPagamento || todayLocalDate();
  const valorFinal = Number(valorPersonalizado ?? t.valorPago ?? t.valor ?? 0);
  const updatedTrabalho = JSON.parse(JSON.stringify(t));
  updatedTrabalho.estado = 'Pago';
  updatedTrabalho.dataEstado = new Date().toISOString();
  updatedTrabalho.historicoEstados = Array.isArray(updatedTrabalho.historicoEstados) ? updatedTrabalho.historicoEstados : [];
  const last = updatedTrabalho.historicoEstados[updatedTrabalho.historicoEstados.length - 1];
  if(!last || normalizeEstado(last.estado) !== 'Pago'){
    updatedTrabalho.historicoEstados.push({ estado:'Pago', data:updatedTrabalho.dataEstado });
  }
  updatedTrabalho.paymentStatus = 'Pago';
  updatedTrabalho.paymentMethod = metodo;
  updatedTrabalho.metodoPagamento = metodo;
  updatedTrabalho.dataPagamento = finalPaymentDate;
  updatedTrabalho.dataFim = finalPaymentDate;
  updatedTrabalho.valorPago = valorFinal;

  const existingPagamento = pagamentos.find(p => (p.sourceWorkId && p.sourceWorkId === t.id) || (p.workCode && t.workCode && p.workCode === t.workCode));
  const pagamento = {
    ...(existingPagamento ? JSON.parse(JSON.stringify(existingPagamento)) : {}),
    id: existingPagamento?.id || genId('pay'),
    cliente: updatedTrabalho.cliente || '',
    referencia: updatedTrabalho.workCode || updatedTrabalho.tipoTrabalho || '',
    workDate: updatedTrabalho.dataInicio || '',
    data: finalPaymentDate,
    valor: valorFinal,
    metodo,
    invoiceType: updatedTrabalho.invoiceType || 'Com Fatura',
    sourceWorkId: updatedTrabalho.id,
    workCode: updatedTrabalho.workCode || ''
  };

  try {
    await ensureFirebaseReady();
    await Promise.all([
      upsertRemote('trabalhos', updatedTrabalho),
      upsertRemote('pagamentos', pagamento)
    ]);

    Object.assign(t, updatedTrabalho);
    if(existingPagamento){
      Object.assign(existingPagamento, pagamento);
    } else {
      pagamentos.push(pagamento);
    }
    saveLocal();
    renderAll();
    setTimeout(()=>{ try{ renderAll(); }catch(e){} }, 200);
    forceAppRefresh();
    return true;
  } catch(err){
    console.error(err);
    setSyncMessage('Erro a guardar pagamento no Firebase', 'bad');
    return false;
  }
}


window.deletePagamento = async function(id){
  if(!adminGuard('manage_work_orders', 'Sem permissão para gerir trabalhos.')) return;
  if(!confirm('Apagar este registo de pagamento?')) return;
  try{
    await removeRemote('pagamentos', id);
    pagamentos = pagamentos.filter(x => x.id !== id);
    saveLocal();
    renderAll();
    forceAppRefresh();
  }catch(err){
    console.error(err);
    setSyncMessage('Erro a apagar no Firebase', 'bad');
    alert(`Não foi possível apagar o pagamento na Firebase. ${err?.code ? '(' + err.code + ')' : ''}`.trim());
  }
};


window.showDesc = function(id){
  const t = trabalhos.find(x => x.id === id);
  if(!t) return;
  const descValue = t.descricao || t.descrição || t.description || t.desc || '';
  $('descModalTitle').textContent = `${t.cliente || '-'} • ${t.tipoTrabalho || '-'}`;
  $('descModalText').textContent = descValue || 'Sem descrição.';
  $('descModal').classList.remove('hidden');
};

$('closeDescModal')?.addEventListener('click', ()=> $('descModal').classList.add('hidden'));
$('descModal')?.addEventListener('click', (e)=>{ if(e.target.id === 'descModal') $('descModal').classList.add('hidden'); });

let pendingPaymentWorkId = null;
let selectedPaymentMethod = '';
let paymentConfirmInFlight = false;

function resetPaymentModalState(){
  selectedPaymentMethod = '';
  paymentConfirmInFlight = false;
  if($('paymentMethodInput')) $('paymentMethodInput').value = '';
  $('paymentConfirmBtn')?.setAttribute('disabled','disabled');
  document.querySelectorAll('.pay-method-btn').forEach(btn=>btn.classList.remove('selected'));
}

function hidePaymentModal(){
  const modal = $('paymentMethodModal');
  if(!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('show');
  modal.style.display = 'none';
}

function showPaymentModal(){
  const modal = $('paymentMethodModal');
  if(!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('show');
  modal.style.display = 'grid';
}

window.marcarComoPagoComValor = function(id){
  if(!hasRolePermission('manage_payments')){ alert('Sem permissão para abrir o fluxo de pagamento.'); return; }
  const t = trabalhos.find(x => x.id === id);
  if(!t) return;
  pendingPaymentWorkId = id;
  resetPaymentModalState();
  $('paymentJobName').textContent = t.tipoTrabalho || 'Trabalho';
  $('paymentJobClient').textContent = `${t.cliente || '-'} • ${euro(t.valorPago ?? t.valor ?? 0)}`;
  if($('paymentDateInput')) {
    $('paymentDateInput').value = t.dataPagamento || todayLocalDate();
    $('paymentDateInput').removeAttribute('readonly');
    $('paymentDateInput').disabled = false;
  }
  if($('paymentValueInput')) $('paymentValueInput').value = String(t.valorPago ?? t.valor ?? '').replace('.', ',');
  showPaymentModal();
};

function closePaymentFlow(){
  pendingPaymentWorkId = null;
  resetPaymentModalState();
  hidePaymentModal();
  const modal = $('paymentMethodModal');
  if(modal){
    modal.className = 'modal hidden';
    modal.setAttribute('aria-hidden','true');
    modal.style.cssText = 'display:none !important;';
  }
  document.body.classList.remove('modal-open');
}

$('closePaymentMethodModal')?.addEventListener('click', closePaymentFlow);
$('cancelPaymentMethodModal')?.addEventListener('click', closePaymentFlow);
$('paymentMethodModal')?.addEventListener('click', (e)=>{
  if(e.target.id === 'paymentMethodModal' && !paymentConfirmInFlight){
    closePaymentFlow();
  }
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && !($('paymentMethodModal')?.classList.contains('hidden')) && !paymentConfirmInFlight){
    closePaymentFlow();
  }
});
document.querySelectorAll('.pay-method-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(!pendingPaymentWorkId || paymentConfirmInFlight) return;
    selectedPaymentMethod = btn.dataset.method || 'Manual';
    if($('paymentMethodInput')) $('paymentMethodInput').value = selectedPaymentMethod;
    document.querySelectorAll('.pay-method-btn').forEach(b=>b.classList.toggle('selected', b===btn));
    $('paymentConfirmBtn')?.removeAttribute('disabled');
  });
});
$('paymentConfirmBtn')?.addEventListener('click', async ()=>{
  if(!pendingPaymentWorkId || paymentConfirmInFlight) return;
  const method = selectedPaymentMethod || $('paymentMethodInput')?.value || '';
  if(!method){
    alert('Escolhe um método de pagamento.');
    return;
  }
  const valorRaw = String($('paymentValueInput')?.value || '').trim().replace(',', '.');
  if(!valorRaw){
    alert('Introduz o valor do pagamento.');
    return;
  }
  const valorNum = Number(valorRaw);
  if(Number.isNaN(valorNum)){
    alert('Valor inválido.');
    return;
  }
  paymentConfirmInFlight = true;
  const btn = $('paymentConfirmBtn');
  btn?.setAttribute('disabled','disabled');
  const currentPaymentId = pendingPaymentWorkId;
  const currentPaymentMethod = method;
  const currentPaymentDate = $('paymentDateInput')?.value || todayLocalDate();
  const currentPaymentValue = valorNum;
  closePaymentFlow();
  const ok = await window.markAsPaid(currentPaymentId, currentPaymentMethod, currentPaymentDate, currentPaymentValue);
  paymentConfirmInFlight = false;
  if(ok){
    renderAll();
    setTimeout(()=>{ try { renderAll(); } catch(e) {} }, 200);
  } else {
    alert(`Não foi possível guardar o pagamento na Firebase. ${err?.code ? '(' + err.code + ')' : ''}`.trim());
  }
});

$('cliente')?.addEventListener('change', fillClientContactFromSelection);


$('userManagerForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if(!hasRolePermission('manage_users')) return;

  const indexRaw = $('managedUserIndex').value;
  const username = $('managedUsername').value.trim();
  const email = normalizeEmail($('managedEmail').value);
  const password = $('managedPassword').value.trim();
  const role = $('managedRole').value;

  if(!username || !email || !password){
    alert('Preenche nome, email e palavra-passe de referência.');
    return;
  }

  const users = getManagedUsers();
  const item = { username, email, password, role };

  if(indexRaw !== ''){
    users[Number(indexRaw)] = item;
  }else{
    const exists = users.some(u => (u.username || '').toLowerCase() === username.toLowerCase() || normalizeEmail(u.email) === email);
    if(exists){
      alert('Esse utilizador ou email já existe.');
      return;
    }
    users.push(item);
  }

  saveManagedUsers(users);
  $('userManagerForm').reset();
  $('managedUserIndex').value = '';
  if($('managedEmail')) $('managedEmail').value = '';
  $('managedRole').value = 'consulta';
  renderManagedUsers();
  updateWorkCodePreview();
  updateWorkCodePreview();
  renderMobileCards();
});

$('clearManagedUserBtn')?.addEventListener('click', ()=>{
  $('userManagerForm')?.reset();
  $('managedUserIndex').value = '';
  if($('managedEmail')) $('managedEmail').value = '';
  $('managedRole').value = 'consulta';
});


function renderMobileCards(){
  const trabWrap = $('trabalhosCardsWrap');
  if(trabWrap){
    const term = $('searchTrabalhos') ? $('searchTrabalhos').value.trim().toLowerCase() : '';
    const globalTerm = ($('globalSearch')?.value || '').trim().toLowerCase();
    const estado = $('filterEstado') ? $('filterEstado').value : '';
    const rows = trabalhos.filter(t=>{
      const hay=[t.workCode,t.cliente,t.tipoTrabalho,t.contacto,t.descricao,t.estado,t.invoiceType].join(' ').toLowerCase();
      return (!term||hay.includes(term))&&(!globalTerm||hay.includes(globalTerm))&&(!estado||t.estado===estado);
    }).sort((a,b)=>getWorkCodeNumber(b.workCode)-getWorkCodeNumber(a.workCode));
    trabWrap.innerHTML = rows.length ? rows.map(t=>{
      const invoiceType = t.invoiceType || 'Com Fatura';
      const invoiceClass = invoiceType === 'Sem Fatura' ? 'sem' : 'com';
      return `<article class="mobile-card">
        <div>
          <div class="mobile-card-title">${escapeHtml(t.cliente || '-')}</div>
          <div class="mobile-card-sub">${escapeHtml(t.tipoTrabalho || '-')} • <strong>${escapeHtml(t.workCode || '-')}</strong></div>
        </div>
        <div class="mobile-card-grid">
          <div class="mobile-card-item"><span>ID</span><strong>${escapeHtml(t.workCode || '-')}</strong></div>
          <div class="mobile-card-item"><span>Valor</span><strong>${euro(t.valorPago ?? t.valor ?? 0)}</strong></div>
          <div class="mobile-card-item"><span>Estado</span><strong><div class="status-cell-inline"><span class="badge" data-state="${escapeHtml(t.estado||'-')}">${escapeHtml(t.estado||'-')}</span></div></strong></div>
          <div class="mobile-card-item"><span>Faturação</span><strong><span class="invoice-badge ${invoiceClass}">${escapeHtml(invoiceType)}</span></strong></div>
        </div>
        ${trabalhoActions(t)}
      </article>`;
    }).join('') : '<div class="mobile-card"><div class="mobile-card-title">Sem resultados</div></div>';
  }

  const pagWrap = $('pagamentosCardsWrap');
  if(pagWrap){
    pagWrap.innerHTML = pagamentos.length ? pagamentos.slice().reverse().map(p=>{
      const invoiceType = p.invoiceType || 'Com Fatura';
      const invoiceClass = invoiceType === 'Sem Fatura' ? 'sem' : 'com';
      return `<article class="mobile-card">
        <div>
          <div class="mobile-card-title">${escapeHtml(p.cliente || '-')}</div>
          <div class="mobile-card-sub">${escapeHtml(p.referencia || '-')}</div>
        </div>
        <div class="mobile-card-grid">
          <div class="mobile-card-item"><span>Data</span><strong>${fmtDate(p.workDate || p.data || '')}</strong></div>
          <div class="mobile-card-item"><span>Valor</span><strong>${euro(p.valor || 0)}</strong></div>
          <div class="mobile-card-item"><span>Método</span><strong>${escapeHtml(p.metodo || 'Manual')}</strong></div>
          <div class="mobile-card-item"><span>Faturação</span><strong><span class="invoice-badge ${invoiceClass}">${escapeHtml(invoiceType)}</span></strong></div>
        </div>
        ${hasRolePermission('manage_payments') ? `<div class="row-actions"><button class="small-btn danger" onclick="deletePagamento('${p.id}')">Apagar</button></div>` : ''}
      </article>`;
    }).join('') : '<div class="mobile-card"><div class="mobile-card-title">Sem pagamentos registados</div></div>';
  }

  const cliWrap = $('clientesCardsWrap');
  if(cliWrap){
    const term = $('searchClientes') ? $('searchClientes').value.trim().toLowerCase() : '';
    const rows = clientes.filter(c=>{
      const hay=[c.nome,c.telefone,c.email,c.nif].join(' ').toLowerCase();
      return !term || hay.includes(term);
    }).slice().reverse();
    cliWrap.innerHTML = rows.length ? rows.map(c=>`
      <article class="mobile-card">
        <div>
          <div class="mobile-card-title">${escapeHtml(c.nome || '-')}</div>
          <div class="mobile-card-sub">${escapeHtml(c.email || '-')}</div>
        </div>
        <div class="mobile-card-grid">
          <div class="mobile-card-item"><span>Telefone</span><strong>${escapeHtml(c.telefone || '-')}</strong></div>
          <div class="mobile-card-item"><span>NIF</span><strong>${escapeHtml(c.nif || '-')}</strong></div>
        </div>
        <div class="row-actions">${clienteActions(c)}</div>
      </article>
    `).join('') : '<div class="mobile-card"><div class="mobile-card-title">Sem clientes registados</div></div>';
  }
}





function legacy2_openPaymentMethodModal(id){
  const trabalhosLista = window.trabalhos || (typeof trabalhos !== 'undefined' ? trabalhos : []);
  const t = trabalhosLista.find(x => String(x.id) === String(id));
  if(!t) return;

  const modal = document.getElementById('paymentMethodModal');
  if(!modal) return;

  const dateInput = document.getElementById('paymentDateInput');
  const valueInput = document.getElementById('paymentValueInput');
  const hiddenId = document.getElementById('paymentWorkId');
  const methodInput = document.getElementById('paymentMethodInput');

  if(hiddenId) hiddenId.value = id;
  if(methodInput) methodInput.value = '';
  if(dateInput) dateInput.value = (t.dataPagamento && String(t.dataPagamento).trim()) ? t.dataPagamento : getTodayLocalDateStr();
  if(valueInput) valueInput.value = String(t.valor || t.valorPago || '').replace('.', ',');

  modal.style.display = 'grid';
  modal.classList.add('show');
}

function legacy2_closePaymentMethodModal(){
  const modal = document.getElementById('paymentMethodModal');
  if(!modal) return;
  modal.style.display = 'none';
  modal.classList.remove('show');
}

function legacy2_confirmPaymentMethod(method){
  const trabalhosLista = window.trabalhos || (typeof trabalhos !== 'undefined' ? trabalhos : []);
  const hiddenId = document.getElementById('paymentWorkId');
  const dateInput = document.getElementById('paymentDateInput');
  const valueInput = document.getElementById('paymentValueInput');
  const methodInput = document.getElementById('paymentMethodInput');

  const id = hiddenId ? hiddenId.value : '';
  const t = trabalhosLista.find(x => String(x.id) === String(id));
  if(!t) return;

  const dataPagamento = dateInput && dateInput.value ? dateInput.value : getTodayLocalDateStr();
  const valorRaw = valueInput ? String(valueInput.value || '').trim().replace(',', '.') : '';
  if(!valorRaw){
    alert('Introduz o valor do pagamento.');
    return;
  }
  const valorNum = Number(valorRaw);
  if(Number.isNaN(valorNum)){
    alert('Valor inválido.');
    return;
  }

  t.paymentStatus = 'Pago';
  t.paymentMethod = method || (methodInput ? methodInput.value : '') || 'Outro';
  t.dataPagamento = dataPagamento;
  t.valorPago = valorNum;
  t.estado = 'Pago';
  t.dataEstado = new Date().toISOString();
  t.historicoEstados = Array.isArray(t.historicoEstados) ? t.historicoEstados : [];
  t.historicoEstados.push({
    estado: 'Pago',
    data: new Date().toISOString()
  });

  if(typeof window.saveData === 'function') window.saveData();
  else if(typeof saveData === 'function') saveData();
  else if(typeof window.saveTrabalhos === 'function') window.saveTrabalhos();
  else if(typeof saveTrabalhos === 'function') saveTrabalhos();
  else {
    try { localStorage.setItem('trabalhos', JSON.stringify(trabalhosLista)); } catch(e) {}
  }

  closePaymentMethodModal();

  if(typeof window.renderTrabalhos === 'function') window.renderTrabalhos();
  else if(typeof renderTrabalhos === 'function') renderTrabalhos();

  try { if(typeof window.renderPagamentos === 'function') window.renderPagamentos(); else if(typeof renderPagamentos === 'function') renderPagamentos(); } catch(e) {}
  try { if(typeof window.renderDashboard === 'function') window.renderDashboard(); else if(typeof renderDashboard === 'function') renderDashboard(); } catch(e) {}
}


document.addEventListener("DOMContentLoaded", function(){

  const page = document.getElementById("configuracoes-page");
  if(!page) return;

  if(document.getElementById("backupToolsCard")) return;

  const div = document.createElement("div");
  div.id = "backupToolsCard";
  div.innerHTML = `
    <div style="margin-top:20px;padding:15px;border-radius:12px;background:#0f172a;border:1px solid rgba(255,255,255,0.1)">
      <h3 style="margin-bottom:10px">Backups</h3>
      <div style="margin-bottom:10px">
        Último: <span id="backupLastStatus">--</span> |
        Total: <span id="backupCountStatus">0</span>
      </div>
      <button onclick="exportBackupManual()">Exportar</button>
      <button onclick="downloadLatestWeeklyBackup()" style="margin-left:8px">Download</button>
      <input type="file" onchange="importBackupFile(event)" style="margin-left:8px">
    </div>
  `;

  page.appendChild(div);

  try{refreshBackupStatusUi();
  try{ updateBackupWeekIndicator(); }catch(e){}
  try{fazerBackupSexta();}catch(e){}}catch(e){}

});


/* BACKUP AUTOMÁTICO SEXTA-FEIRA */
function isFriday(){
  return new Date().getDay() === 5;
}

function getLastBackupDay(){
  return localStorage.getItem("backupFridayDone");
}

function setBackupDoneToday(){
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem("backupFridayDone", today);
}

function fazerBackupSexta(){
  const hoje = new Date().toISOString().split('T')[0];
  const ultimo = getLastBackupDay();

  if(!isFriday()) return;

  if(ultimo === hoje) return;

  const data = {
    trabalhos: JSON.parse(localStorage.getItem("trabalhos") || "[]"),
    clientes: JSON.parse(localStorage.getItem("clientes") || "[]"),
    pagamentos: JSON.parse(localStorage.getItem("pagamentos") || "[]"),
    dataBackup: new Date().toISOString()
  };

  const backups = JSON.parse(localStorage.getItem("backupFridayHistory") || "[]");
  backups.push(data);

  if(backups.length > 10){
    backups.shift();
  }

  localStorage.setItem("backupFridayHistory", JSON.stringify(backups));

  setBackupDoneToday();

  mostrarAvisoBackup();
}

function mostrarAvisoBackup(){
  const aviso = document.createElement("div");
  aviso.innerHTML = `
    <div style="
      position:fixed;
      bottom:20px;
      right:20px;
      background:#1e293b;
      border:1px solid rgba(255,255,255,0.1);
      padding:12px 16px;
      border-radius:12px;
      z-index:9999;
      box-shadow:0 10px 20px rgba(0,0,0,0.3);
      color:white;
      font-size:13px;
    ">
      Backup semanal criado ✔
      <br>
      <button onclick="exportBackupManual()" style="margin-top:6px">Exportar agora</button>
    </div>
  `;
  document.body.appendChild(aviso);

  setTimeout(()=>aviso.remove(), 6000);
}


function getWeekStart(dateObj){
  const d = new Date(dateObj);
  const day = d.getDay(); // 0 domingo
  const diff = d.getDate() - day;
  d.setHours(0,0,0,0);
  d.setDate(diff);
  return d;
}

function updateBackupWeekIndicator(){
  const badge = document.getElementById('backupWeekBadge');
  const weekStatus = document.getElementById('backupWeekStatus');
  const lastStatus = document.getElementById('backupLastStatus');
  const countStatus = document.getElementById('backupCountStatus');

  const backups = JSON.parse(localStorage.getItem('backupFridayHistory') || '[]');
  const lastDateIso = localStorage.getItem('backupFridayDone') || localStorage.getItem('weeklyAutoBackupLastDate') || '';
  const lastDate = lastDateIso ? new Date(lastDateIso) : null;
  const now = new Date();

  let hasThisWeek = false;
  if(lastDate && !isNaN(lastDate.getTime())){
    const weekStartNow = getWeekStart(now).getTime();
    const weekStartLast = getWeekStart(lastDate).getTime();
    hasThisWeek = weekStartNow === weekStartLast;
  }

  if(lastStatus) lastStatus.textContent = lastDateIso ? fmtDate(lastDateIso) : '--';
  if(countStatus) countStatus.textContent = String(backups.length);

  if(hasThisWeek){
    if(weekStatus) weekStatus.textContent = 'Backup feito';
    if(badge){
      badge.textContent = 'Feito esta semana';
      badge.classList.remove('warn');
      badge.classList.add('ok');
    }
  }else{
    if(weekStatus) weekStatus.textContent = 'Falta backup';
    if(badge){
      badge.textContent = 'Falta backup';
      badge.classList.remove('ok');
      badge.classList.add('warn');
    }
  }
}


function getReportWorkList(){
  const trabalhosLista = window.trabalhos || (typeof trabalhos !== 'undefined' ? trabalhos : []);
  return Array.isArray(trabalhosLista) ? trabalhosLista : [];
}

function getClientNameFromWork(t){
  return String(
    (t && (t.clienteNome || t.cliente || t.nomeCliente || t.clientName || t.nome)) || 'Sem Cliente'
  ).trim() || 'Sem Cliente';
}

function getWorkValueNumber(t){
  const raw = t && (t.valorPago ?? t.valor ?? t.preco ?? t.price ?? 0);
  const val = Number(String(raw).replace(',', '.'));
  return Number.isFinite(val) ? val : 0;
}

function buildAdvancedReportData(){
  const works = getReportWorkList();
  const paidWorks = works.filter(t => String(t.paymentStatus || t.estado || '').toLowerCase() === 'pago' || String(t.estado || '').toLowerCase() === 'pago');
  const totalValue = paidWorks.reduce((sum, t) => sum + getWorkValueNumber(t), 0);
  const avgValue = paidWorks.length ? totalValue / paidWorks.length : 0;

  const clientMap = {};
  works.forEach(t => {
    const client = getClientNameFromWork(t);
    if(!clientMap[client]){
      clientMap[client] = { nome: client, total: 0, count: 0, latest: null, latestWork: null };
    }
    clientMap[client].total += getWorkValueNumber(t);
    clientMap[client].count += 1;
    const dateRef = t.dataFim || t.dataPagamento || t.dataInicio || t.data || '';
    if(dateRef && (!clientMap[client].latest || new Date(dateRef) > new Date(clientMap[client].latest))){
      clientMap[client].latest = dateRef;
      clientMap[client].latestWork = t;
    }
  });

  const ranking = Object.values(clientMap).sort((a,b) => b.total - a.total).slice(0, 8);
  const history = Object.values(clientMap)
    .sort((a,b) => {
      const da = a.latest ? new Date(a.latest).getTime() : 0;
      const db = b.latest ? new Date(b.latest).getTime() : 0;
      return db - da;
    })
    .slice(0, 8);

  return {
    works,
    paidWorks,
    totalValue,
    avgValue,
    ranking,
    history,
    topClient: ranking.length ? ranking[0] : null
  };
}

function formatEuroValue(v){
  const num = Number(v || 0);
  return `${num.toFixed(2)}€`;
}

function renderAdvancedReports(){
  const avgEl = document.getElementById('reportAvgWorkValue');
  const topEl = document.getElementById('reportTopClientValue');
  const rankingEl = document.getElementById('reportClientRanking');
  const historyEl = document.getElementById('reportClientHistory');
  if(!avgEl || !topEl || !rankingEl || !historyEl) return;

  const data = buildAdvancedReportData();

  avgEl.textContent = formatEuroValue(data.avgValue);
  topEl.textContent = data.topClient ? `${data.topClient.nome} · ${formatEuroValue(data.topClient.total)}` : '--';

  if(!data.ranking.length){
    rankingEl.innerHTML = '<div class="relatorios-empty">Sem dados suficientes para ranking.</div>';
  }else{
    rankingEl.innerHTML = data.ranking.map((item, index) => `
      <div class="relatorios-list-item">
        <div class="meta">
          <span class="title">${index + 1}. ${escapeHtml(item.nome)}</span>
          <span class="sub">${item.count} trabalho(s)</span>
        </div>
        <span class="amount">${formatEuroValue(item.total)}</span>
      </div>
    `).join('');
  }

  if(!data.history.length){
    historyEl.innerHTML = '<div class="relatorios-empty">Sem histórico recente.</div>';
  }else{
    historyEl.innerHTML = data.history.map(item => {
      const latestWork = item.latestWork || {};
      const dateText = item.latest ? fmtDate(item.latest) : '--';
      const stateText = latestWork.estado || 'Sem estado';
      return `
        <div class="relatorios-list-item">
          <div class="meta">
            <span class="title">${escapeHtml(item.nome)}</span>
            <span class="sub">${dateText} · ${escapeHtml(stateText)}</span>
          </div>
          <span class="amount">${item.count} reg.</span>
        </div>
      `;
    }).join('');
  }
}

function buildProfessionalReportHtml(){
  const data = buildAdvancedReportData();
  const rankingHtml = data.ranking.length ? data.ranking.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.nome)}</td>
      <td>${item.count}</td>
      <td>${formatEuroValue(item.total)}</td>
    </tr>
  `).join('') : '<tr><td colspan="4">Sem dados</td></tr>';

  const historyHtml = data.history.length ? data.history.map(item => {
    const latestWork = item.latestWork || {};
    return `
      <tr>
        <td>${escapeHtml(item.nome)}</td>
        <td>${item.latest ? fmtDate(item.latest) : '--'}</td>
        <td>${escapeHtml(latestWork.estado || 'Sem estado')}</td>
        <td>${item.count}</td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="4">Sem dados</td></tr>';

  return `
  <html>
    <head>
      <title>Relatório Profissional</title>
      <style>
        body{font-family:Arial,sans-serif;padding:28px;color:#0f172a}
        .hero{padding:18px 20px;border-radius:18px;background:linear-gradient(135deg,#6d28d9,#0f172a);color:#fff;margin-bottom:18px}
        .hero h1{margin:0 0 8px 0;font-size:28px}
        .hero p{margin:0;opacity:.9}
        .stats{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:12px;margin-bottom:18px}
        .card{border:1px solid #dbe4f0;border-radius:14px;padding:14px}
        .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6d28d9}
        .value{font-size:24px;font-weight:800;margin-top:8px}
        h2{margin:24px 0 10px 0}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #e2e8f0;padding:10px;text-align:left}
        th{background:#f5f3ff;color:#4c1d95}
      
/* CAMPOS SÓ ADMIN MESTRE NO ADICIONAR */
.master-edit-only.is-hidden-by-role{
  display:none !important;
}


/* CAMPOS AVANÇADOS DO TRABALHO */
.field-hidden-by-role{
  display:none !important;
}

</style>
    </head>
    <body>
      <div class="hero">
        <h1>Relatório Profissional</h1>
        <p>Resumo avançado de clientes, faturação e histórico.</p>
      </div>

      <div class="stats">
        <div class="card">
          <div class="label">Média por trabalho</div>
          <div class="value">${formatEuroValue(data.avgValue)}</div>
        </div>
        <div class="card">
          <div class="label">Cliente com mais faturação</div>
          <div class="value">${data.topClient ? escapeHtml(data.topClient.nome) : '--'}</div>
        </div>
      </div>

      <h2>Ranking de Clientes</h2>
      <table>
        <thead>
          <tr><th>#</th><th>Cliente</th><th>Trabalhos</th><th>Total</th></tr>
        </thead>
        <tbody>${rankingHtml}</tbody>
      </table>

      <h2>Histórico por Cliente</h2>
      <table>
        <thead>
          <tr><th>Cliente</th><th>Último registo</th><th>Estado</th><th>Total de registos</th></tr>
        </thead>
        <tbody>${historyHtml}</tbody>
      </table>
    </body>
  </html>`;
}

function openProfessionalReportWindow(autoPrint){
  const html = buildProfessionalReportHtml();
  const win = window.open('', '_blank', 'width=1200,height=900');
  if(!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  if(autoPrint){
    setTimeout(() => { try{ win.print(); }catch(e){} }, 500);
  }
}

function exportProfessionalReportPdf(){
  openProfessionalReportWindow(true);
}

function printProfessionalReport(){
  openProfessionalReportWindow(true);
}

