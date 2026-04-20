

const ROLE_DEFINITIONS = {
  consulta: {
    label: 'Consulta',
    description: 'Acesso de leitura para consulta e acompanhamento.',
    tabs: ['dashboard', 'trabalhos', 'clientes', 'relatorios'],
    permissions: ['view_dashboard', 'view_work_orders', 'view_clients', 'view_reports', 'view_payments']
  },
  operador: {
    label: 'Operador',
    description: 'Executa e acompanha trabalhos do dia a dia.',
    tabs: ['dashboard', 'adicionar', 'trabalhos', 'clientes'],
    permissions: ['view_dashboard', 'view_work_orders', 'manage_work_orders', 'view_clients']
  },
  financeiro: {
    label: 'Financeiro',
    description: 'Controla pagamentos, relatórios e fechos.',
    tabs: ['dashboard', 'trabalhos', 'clientes', 'pagamentos', 'relatorios'],
    permissions: ['view_dashboard', 'view_work_orders', 'view_clients', 'view_payments', 'manage_payments', 'view_reports']
  },
  gestor: {
    label: 'Gestor',
    description: 'Gere operação, clientes e acompanhamento.',
    tabs: ['dashboard', 'adicionar', 'trabalhos', 'clientes', 'relatorios'],
    permissions: ['view_dashboard', 'view_work_orders', 'manage_work_orders', 'view_clients', 'manage_clients', 'view_reports']
  },
  admin: {
    label: 'Admin',
    description: 'Administração operacional sem gestão total do sistema.',
    tabs: ['dashboard', 'adicionar', 'trabalhos', 'clientes', 'pagamentos', 'relatorios', 'configuracoes'],
    permissions: ['view_dashboard', 'view_work_orders', 'manage_work_orders', 'view_clients', 'manage_clients', 'view_payments', 'manage_payments', 'view_reports', 'view_settings']
  },
  master_admin: {
    label: 'Admin Mestre',
    description: 'Controlo total da app, utilizadores e configurações.',
    tabs: ['dashboard', 'adicionar', 'trabalhos', 'clientes', 'pagamentos', 'relatorios', 'configuracoes'],
    permissions: ['view_dashboard', 'view_work_orders', 'manage_work_orders', 'view_clients', 'manage_clients', 'view_payments', 'manage_payments', 'view_reports', 'view_settings', 'manage_users', 'manage_app']
  }
};

const DEFAULT_USERS = [
  { username: 'jorge', email: 'jorge@empresa.pt', password: 'jfernandes', role: 'admin' },
  { username: 'fatima', email: 'fatima@empresa.pt', password: 'ffernandes', role: 'financeiro' },
  { username: 'ricardo', email: 'ricardo@empresa.pt', password: '2297', role: 'master_admin' }
];

function getRoleDefinition(role='user'){
  return ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.consulta;
}

function getRoleLabel(role='user'){
  return getRoleDefinition(role).label;
}

function getAllowedTabsForRole(role='user'){
  return getRoleDefinition(role).tabs || ['dashboard'];
}

function hasRolePermission(permission, role=currentRole){
  if(!permission) return true;
  const def = getRoleDefinition(role);
  return Array.isArray(def.permissions) && def.permissions.includes(permission);
}

function canAccessTab(tab, role=currentRole){
  return getAllowedTabsForRole(role).includes(tab);
}

function roleGuard(permission, deniedMessage='Sem permissão para esta ação.'){
  if(hasRolePermission(permission)) return true;
  alert(deniedMessage);
  return false;
}

function normalizeUsers(users){
  const validRoles = new Set(Object.keys(ROLE_DEFINITIONS));
  const list = (Array.isArray(users) ? users.slice() : []).map(u => ({
    ...u,
    role: validRoles.has(String(u?.role || '').trim()) ? String(u.role).trim() : 'consulta'
  }));
  const idx = list.findIndex(u => String(u.username || '').toLowerCase() === 'ricardo');
  const ricardo = { username: 'ricardo', email: 'ricardo@empresa.pt', password: '2297', role: 'master_admin' };
  if(idx >= 0) list[idx] = { ...list[idx], ...ricardo };
  else list.push(ricardo);
  return list;
}

function getUsers(){
  try{
    const stored = JSON.parse(localStorage.getItem('app_users') || 'null');
    if(Array.isArray(stored) && stored.length){
      const fixed = normalizeUsers(stored);
      localStorage.setItem('app_users', JSON.stringify(fixed));
      return fixed;
    }
  }catch{}
  const fixedDefaults = normalizeUsers(DEFAULT_USERS);
  localStorage.setItem('app_users', JSON.stringify(fixedDefaults));
  return fixedDefaults;
}

const loginForm = document.getElementById('loginForm');

function normalizeEmail(value=''){
  return String(value || '').trim().toLowerCase();
}

function getRoleProfileByEmail(email=''){
  const target = normalizeEmail(email);
  if(!target) return null;
  const users = getUsers();
  const exact = users.find(u => normalizeEmail(u.email) === target);
  if(exact) return exact;
  const localPart = target.split('@')[0] || '';
  return users.find(u => String(u.username || '').trim().toLowerCase() === localPart) || null;
}

function saveSession(role, username, email='', uid=''){
  localStorage.setItem('app_session', JSON.stringify({ role, username, email, uid }));
}

function readSession(){
  return JSON.parse(localStorage.getItem('app_session') || 'null');
}

function clearSession(){
  localStorage.removeItem('app_session');
}

function showApp(){
  document.getElementById('loginScreen')?.classList.add('hidden');
  document.getElementById('appRoot')?.classList.remove('hidden');
}

function showLogin(){
  document.getElementById('loginScreen')?.classList.remove('hidden');
  document.getElementById('appRoot')?.classList.add('hidden');
}

function bootFromSession(){
  const session = readSession();
  if(!session || !window.startApp) return false;

  showApp();
  window.startApp(session.role, session.username);
  return true;
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  try{
    if(typeof window.performLogin !== 'function'){
      throw new Error('Sistema de autenticação ainda não ficou pronto.');
    }
    const session = await window.performLogin(email, password);
    saveSession(session.role, session.username, session.email || email, session.uid || '');
    document.getElementById('loginError').textContent = '';
    showApp();
    if(window.startApp){
      window.startApp(session);
    }
  }catch(err){
    document.getElementById('loginError').textContent = err?.message || 'Credenciais inválidas.';
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  try{
    if(typeof window.performLogout === 'function') await window.performLogout();
  }catch(err){
    console.warn(err);
  }
  clearSession();
  localStorage.removeItem('ge_presence_session_id');
  showLogin();
  loginForm?.reset();
});

document.addEventListener('DOMContentLoaded', () => {
  if(!bootFromSession()){
    showLogin();
  }
});





function legacy_openPaymentMethodModal(id){
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

function legacy_closePaymentMethodModal(){
  const modal = document.getElementById('paymentMethodModal');
  if(!modal) return;
  modal.style.display = 'none';
  modal.classList.remove('show');
}

function legacy_confirmPaymentMethod(method){
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


function getBackupTodayIso(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getAppDataSnapshot(){
  const trabalhosLista = window.trabalhos || (typeof trabalhos !== 'undefined' ? trabalhos : JSON.parse(localStorage.getItem('trabalhos') || '[]'));
  const clientesLista = window.clientes || (typeof clientes !== 'undefined' ? clientes : JSON.parse(localStorage.getItem('clientes') || '[]'));
  const pagamentosLista = window.pagamentos || (typeof pagamentos !== 'undefined' ? pagamentos : JSON.parse(localStorage.getItem('pagamentos') || '[]'));
  return {
    trabalhos: Array.isArray(trabalhosLista) ? trabalhosLista : [],
    clientes: Array.isArray(clientesLista) ? clientesLista : [],
    pagamentos: Array.isArray(pagamentosLista) ? pagamentosLista : [],
    dataBackup: new Date().toISOString(),
    versao: 'backup-app-v12'
  };
}

function refreshBackupStatusUi(){
  const lastEl = document.getElementById('backupLastStatus');
  const countEl = document.getElementById('backupCountStatus');
  const weeklyBackups = JSON.parse(localStorage.getItem('weeklyAutoBackups') || '[]');
  const last = localStorage.getItem('weeklyAutoBackupLastDate');
  if(lastEl){
    lastEl.textContent = (last ? fmtDate(last) : '--');
  }
  if(countEl){
    countEl.textContent = String(weeklyBackups.length);
  }
  try{ updateBackupWeekIndicator(); }catch(e){}
}

function exportBackupManual(){
  const data = getAppDataSnapshot();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

function recalcLastTrabIdFromList(trabalhosLista){
  let maxId = 0;
  (Array.isArray(trabalhosLista) ? trabalhosLista : []).forEach(t => {
    const values = [t && t.workCode, t && t.ordemId, t && t.id];
    values.forEach(v => {
      const match = String(v || '').match(/TRAB-(\d+)/i);
      if(match){
        maxId = Math.max(maxId, Number(match[1] || 0));
      }
    });
  });
  try{
    if(typeof window.lastTrabId !== 'undefined') window.lastTrabId = maxId;
    localStorage.setItem('lastTrabId', String(maxId));
  }catch(e){}
}

function importBackupDataObject(data){
  if(!data || typeof data !== 'object'){
    alert('Backup inválido.');
    return;
  }
  const novosTrabalhos = Array.isArray(data.trabalhos) ? data.trabalhos : [];
  const novosClientes = Array.isArray(data.clientes) ? data.clientes : [];
  const novosPagamentos = Array.isArray(data.pagamentos) ? data.pagamentos : [];

  localStorage.setItem('trabalhos', JSON.stringify(novosTrabalhos));
  localStorage.setItem('clientes', JSON.stringify(novosClientes));
  localStorage.setItem('pagamentos', JSON.stringify(novosPagamentos));

  try{
    if(typeof window.trabalhos !== 'undefined') window.trabalhos = novosTrabalhos;
    if(typeof window.clientes !== 'undefined') window.clientes = novosClientes;
    if(typeof window.pagamentos !== 'undefined') window.pagamentos = novosPagamentos;
  }catch(e){}

  recalcLastTrabIdFromList(novosTrabalhos);

  try { if(typeof renderTrabalhos === 'function') renderTrabalhos(); } catch(e){}
  try { if(typeof renderClientes === 'function') renderClientes(); } catch(e){}
  try { if(typeof renderPagamentos === 'function') renderPagamentos(); } catch(e){}
  try { if(typeof renderDashboard === 'function') renderDashboard(); } catch(e){}
  try { if(typeof renderRelatorios === 'function') { renderRelatorios(); try{ renderAdvancedReports(); }catch(e){} }
  try{ renderAdvancedReports(); }catch(e){} } catch(e){}
  try { if(typeof loadAllData === 'function') loadAllData(); } catch(e){}

  alert('Backup importado com sucesso.');
}

function importBackupFile(event){
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = JSON.parse(e.target.result);
      importBackupDataObject(data);
      if(event.target) event.target.value = '';
    }catch(err){
      alert('Não foi possível ler o backup.');
    }
  };
  reader.readAsText(file);
}

function runWeeklyAutomaticBackupSilently(){
  const now = new Date();
  const lastDateIso = localStorage.getItem('weeklyAutoBackupLastDate');
  if(lastDateIso){
    const diffDays = (now - new Date(lastDateIso)) / (1000 * 60 * 60 * 24);
    if(diffDays < 7){
      refreshBackupStatusUi();
  try{ updateBackupWeekIndicator(); }catch(e){}
  try{fazerBackupSexta();}catch(e){}
      return;
    }
  }

  const snapshot = getAppDataSnapshot();
  const backups = JSON.parse(localStorage.getItem('weeklyAutoBackups') || '[]');
  backups.push(snapshot);
  while(backups.length > 12){
    backups.shift();
  }
  localStorage.setItem('weeklyAutoBackups', JSON.stringify(backups));
  localStorage.setItem('weeklyAutoBackupLastDate', snapshot.dataBackup);
  refreshBackupStatusUi();
  try{ updateBackupWeekIndicator(); }catch(e){}
  try{fazerBackupSexta();}catch(e){}
}

function downloadLatestWeeklyBackup(){
  const backups = JSON.parse(localStorage.getItem('weeklyAutoBackups') || '[]');
  if(!backups.length){
    alert('Sem backups semanais.');
    return;
  }
  const latest = backups[backups.length - 1];
  const stamp = String(latest.dataBackup || new Date().toISOString()).replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(latest, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-semanal-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}


document.addEventListener("DOMContentLoaded", function(){

  const page = document.getElementById("configuracoes-page");
  if(!page) return;

  if(document.getElementById("backupToolsCard")) return;

  const div = document.createElement("div");
  div.id = "backupToolsCard";
  div.innerHTML = `
    <div class="backups-premium-wrap">
      <div class="backups-premium-head">
        <div>
          <h3>Backups</h3>
          <p>Proteção automática e recuperação rápida dos dados da app.</p>
        </div>
        <span class="backups-premium-pill">Semanal Automático</span>
      </div>

      <div class="backups-premium-grid">
        <div class="backups-premium-stat">
          <span class="label">Último backup</span>
          <span class="value" id="backupLastStatus">--</span>
        </div>
        <div class="backups-premium-stat">
          <span class="label">Backups guardados</span>
          <span class="value" id="backupCountStatus">0</span>
        </div>
      </div>

      <div class="backups-premium-actions">
        <button class="backups-premium-btn export" onclick="exportBackupManual()">Exportar Backup</button>
        <button class="backups-premium-btn download" onclick="downloadLatestWeeklyBackup()">Download Último</button>
        <label for="backupImportInputPremium">Importar Backup</label>
        <input id="backupImportInputPremium" class="backups-hidden-input" type="file" accept=".json,application/json" onchange="importBackupFile(event)">
      </div>
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

