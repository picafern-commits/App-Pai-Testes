(function () {
  'use strict';

  const PRODUCT_TABS = [
    ['executivo', 'Executivo', 'â—†'],
    ['cobrancas', 'CobranÃ§as', 'â‚¬'],
    ['agenda', 'Agenda', 'â–¡'],
    ['kanban', 'Kanban', 'â–¦'],
    ['anual', 'Anual', 'â—‡'],
  ];

  const STAGES = ['Pendente', 'Em curso', 'Concluído', 'Entregue', 'Pago'];

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(value ?? '').replace(/[&<>"']/g, (char) => map[char]);
  }
  function num(value) {
    const n = Number(String(value ?? 0).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  function euro(value) {
    if (typeof window.euro === 'function') {
      try { return window.euro(value); } catch (err) {}
    }
    return `${num(value).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} â‚¬`;
  }
  function fmtDate(value) {
    if (!value) return '--';
    if (typeof window.fmtDate === 'function') {
      try { return window.fmtDate(value); } catch (err) {}
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toLocaleDateString('pt-PT');
  }
  function daysSince(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }
  function readArray(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (err) { return []; }
  }
  function data() {
    return {
      trabalhos: Array.isArray(window.trabalhos) ? window.trabalhos : readArray('ge_trabalhos').concat(readArray('trabalhos')),
      clientes: Array.isArray(window.clientes) ? window.clientes : readArray('ge_clientes').concat(readArray('clientes')),
      pagamentos: Array.isArray(window.pagamentos) ? window.pagamentos : readArray('ge_pagamentos').concat(readArray('pagamentos')),
      orcamentos: Array.isArray(window.orcamentos) ? window.orcamentos : readArray('ge_orcamentos'),
    };
  }
  function valueWork(t) {
    return num(t.valorPago ?? t.valorTrabalho ?? t.valor ?? t.preco ?? 0);
  }
  function paidValue(t) {
    return num(t.valorPago ?? (String(t.paymentStatus || t.estado || '').toLowerCase() === 'pago' ? valueWork(t) : 0));
  }
  function isPaid(t) {
    return String(t.paymentStatus || t.estado || '').toLowerCase().includes('pago') || paidValue(t) > 0;
  }
  function clientNameFromWork(t) {
    return String(t.cliente || t.clienteNome || t.nomeCliente || t.clientName || 'Sem cliente').trim() || 'Sem cliente';
  }
  function clientByName(name) {
    const clean = String(name || '').trim().toLowerCase();
    return data().clientes.find((c) => String(c.nome || c.cliente || '').trim().toLowerCase() === clean) || null;
  }
  function dueItems() {
    return data().trabalhos
      .filter((t) => !isPaid(t) && valueWork(t) > 0)
      .map((t) => ({ ...t, clienteNomeCalc: clientNameFromWork(t), debtValue: Math.max(0, valueWork(t) - paidValue(t)) }))
      .sort((a, b) => daysSince(b.dataInicio || b.data || b.dataFim) - daysSince(a.dataInicio || a.data || a.dataFim));
  }
  function notifications() {
    const d = data();
    const debts = dueItems();
    const staleBudgets = d.orcamentos.filter((o) => String(o.estado || 'pendente').toLowerCase().includes('pend') && daysSince(o.data) >= 7);
    const noEndDate = d.trabalhos.filter((t) => !t.dataFim && !isPaid(t));
    const backupLast = localStorage.getItem('dailyAutoBackupLastDate') || localStorage.getItem('backupFridayDone') || '';
    const backupOld = !backupLast || daysSince(backupLast) >= 2;
    const items = [];
    if (debts.length) items.push({ type: 'bad', title: `${debts.length} valores por receber`, body: `Total em aberto: ${euro(debts.reduce((s, t) => s + t.debtValue, 0))}` });
    if (staleBudgets.length) items.push({ type: 'warn', title: `${staleBudgets.length} orÃ§amentos parados`, body: 'OrÃ§amentos pendentes hÃ¡ 7 dias ou mais.' });
    if (noEndDate.length) items.push({ type: 'warn', title: `${noEndDate.length} trabalhos sem data final`, body: 'RevÃª planeamento/entrega destes trabalhos.' });
    if (backupOld) items.push({ type: 'warn', title: 'Backup precisa de atenÃ§Ã£o', body: backupLast ? `Ãšltimo backup: ${fmtDate(backupLast)}` : 'Ainda nÃ£o hÃ¡ backup registado.' });
    return items;
  }
  function monthKey(value) {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function thisMonthReceived() {
    const key = monthKey(new Date());
    return data().pagamentos.filter((p) => monthKey(p.data || p.dataPagamento) === key).reduce((s, p) => s + num(p.valor), 0);
  }
  function setTitle(title, subline) {
    const h = byId('pageTitle');
    const s = document.querySelector('.subline');
    if (h) h.textContent = title;
    if (s && subline) s.textContent = subline;
  }

  function pageTemplate(id, title, subtitle) {
    return `<section class="page product-page" id="${id}-page"><div class="product-shell">
      <div class="product-hero"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="product-action" data-product-refresh>Atualizar</button></div>
      <div id="${id}ProductBody"></div>
    </div></section>`;
  }

  function addNav() {
    const nav = document.querySelector('.sidebar nav') || document.querySelector('.sidebar');
    if (nav && !byId('productNavMarker')) {
      const marker = document.createElement('div');
      marker.id = 'productNavMarker';
      marker.className = 'product-nav-separator';
      nav.insertBefore(marker, nav.querySelector('[data-tab="configuracoes"]') || null);
      PRODUCT_TABS.forEach(([id, label, icon]) => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn product-nav-btn';
        btn.dataset.productTab = id;
        btn.innerHTML = `<span class="nav-icon">${icon}</span><span>${label}</span>`;
        nav.insertBefore(btn, nav.querySelector('[data-tab="configuracoes"]') || null);
      });
    }
    const bottom = document.querySelector('.bottom-nav');
    if (bottom && !bottom.querySelector('[data-product-tab="cobrancas"]')) {
      [['cobrancas', 'CobranÃ§as'], ['agenda', 'Agenda'], ['kanban', 'Kanban']].forEach(([id, label]) => {
        const btn = document.createElement('button');
        btn.className = 'bottom-btn product-nav-btn';
        btn.dataset.productTab = id;
        btn.textContent = label;
        bottom.insertBefore(btn, bottom.querySelector('[data-tab="configuracoes"]') || null);
      });
    }
  }

  function addPages() {
    const container = byId('configuracoes-page')?.parentElement || document.querySelector('.main') || document.body;
    PRODUCT_TABS.forEach(([id, label]) => {
      if (!byId(`${id}-page`)) {
        const subtitles = {
          executivo: 'VisÃ£o rÃ¡pida da operaÃ§Ã£o, valores, alertas e evoluÃ§Ã£o mensal.',
          cobrancas: 'Valores em aberto, clientes com dÃ­vida e aÃ§Ãµes rÃ¡pidas de pagamento.',
          agenda: 'Trabalhos organizados por data para planeamento diÃ¡rio.',
          kanban: 'Pipeline visual dos trabalhos por estado.',
          anual: 'Resumo anual de faturaÃ§Ã£o, clientes e mÃ©todos de pagamento.',
        };
        container.insertAdjacentHTML('beforeend', pageTemplate(id, label, subtitles[id]));
      }
    });
    if (!byId('productModal')) {
      document.body.insertAdjacentHTML('beforeend', '<div id="productModal" class="product-modal"><div class="product-modal-card"><div class="product-modal-head"><h2 id="productModalTitle"></h2><button class="product-close" data-close-product-modal>Ã—</button></div><div id="productModalBody"></div></div></div>');
    }
    if (!byId('notificationBell')) {
      document.body.insertAdjacentHTML('beforeend', '<button id="notificationBell" class="notification-bell" title="NotificaÃ§Ãµes">!</button>');
    }
  }

  function switchProductTab(id) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn,.bottom-btn').forEach((b) => b.classList.remove('active'));
    byId(`${id}-page`)?.classList.add('active');
    document.querySelectorAll(`[data-product-tab="${id}"]`).forEach((b) => b.classList.add('active'));
    setTitle(PRODUCT_TABS.find((t) => t[0] === id)?.[1] || 'GestÃ£o', 'Sistema de gestÃ£o operacional');
    sessionStorage.setItem('gestao:lastTab', id);
    renderAllProduct();
  }

  function renderExecutive() {
    const d = data();
    const debts = dueItems();
    const received = thisMonthReceived();
    const pending = d.trabalhos.filter((t) => !isPaid(t));
    const budgets = d.orcamentos.filter((o) => String(o.estado || '').toLowerCase().includes('pend'));
    const recent = d.trabalhos.slice().sort((a, b) => new Date(b.dataInicio || b.data || 0) - new Date(a.dataInicio || a.data || 0)).slice(0, 6);
    const body = byId('executivoProductBody');
    if (!body) return;
    body.innerHTML = `<div class="product-grid">
      ${kpi('Trabalhos abertos', pending.length, 'Ainda nÃ£o pagos ou fechados')}
      ${kpi('Por receber', euro(debts.reduce((s, t) => s + t.debtValue, 0)), `${debts.length} registos`)}
      ${kpi('Recebido este mÃªs', euro(received), 'Pagamentos registados')}
      ${kpi('OrÃ§amentos pendentes', budgets.length, 'Aguardam decisÃ£o')}
    </div>
    <div class="product-grid two">
      <div class="product-card"><h3>Alertas prioritÃ¡rios</h3>${listNotifications()}</div>
      <div class="product-card"><h3>Trabalhos recentes</h3><div class="product-list">${recent.map(workRow).join('') || empty('Sem trabalhos recentes.')}</div></div>
    </div>
    <div class="product-card"><h3>EvoluÃ§Ã£o mensal</h3>${monthlyBars()}</div>`;
  }
  function kpi(label, value, small) {
    return `<div class="product-card product-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small)}</small></div>`;
  }
  function empty(text) { return `<div class="product-row"><div class="product-row-main"><span>${esc(text)}</span></div></div>`; }
  function workRow(t) {
    return `<div class="product-row"><div class="product-row-main"><strong>${esc(clientNameFromWork(t))}</strong><span>${esc(t.tipoTrabalho || t.referencia || 'Trabalho')} Â· ${fmtDate(t.dataInicio || t.data || t.dataFim)}</span></div><span class="product-pill ${isPaid(t) ? '' : 'warn'}">${esc(t.estado || t.paymentStatus || 'Pendente')}</span></div>`;
  }
  function listNotifications() {
    const items = notifications();
    return `<div class="product-list">${items.map((n) => `<div class="product-row"><div class="product-row-main"><strong>${esc(n.title)}</strong><span>${esc(n.body)}</span></div><span class="product-pill ${n.type}">${n.type === 'bad' ? 'Urgente' : 'Aviso'}</span></div>`).join('') || empty('Sem alertas crÃ­ticos.')}</div>`;
  }
  function monthlyBars() {
    const d = data();
    const map = new Map();
    d.pagamentos.forEach((p) => {
      const key = monthKey(p.data || p.dataPagamento);
      if (!key) return;
      map.set(key, (map.get(key) || 0) + num(p.valor));
    });
    const rows = [...map.entries()].sort().slice(-12);
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return `<div class="product-list">${rows.map(([key, value]) => `<div class="product-row"><div class="product-row-main"><strong>${key}</strong><span><span style="display:inline-block;height:8px;width:${Math.max(6, (value / max) * 220)}px;background:#2fb3a3;border-radius:99px"></span></span></div><span class="product-pill">${euro(value)}</span></div>`).join('') || empty('Sem pagamentos para mostrar.')}</div>`;
  }

  function renderDebts() {
    const body = byId('cobrancasProductBody');
    if (!body) return;
    const rows = dueItems();
    body.innerHTML = `<div class="product-card"><div class="product-toolbar"><input id="debtSearch" placeholder="Pesquisar cliente ou trabalho"><select id="debtAge"><option value="">Todas as idades</option><option value="7">+7 dias</option><option value="30">+30 dias</option></select></div></div><div class="product-table-wrap"><table class="product-table"><thead><tr><th>Cliente</th><th>Trabalho</th><th>Data</th><th>Dias</th><th>Valor</th><th>AÃ§Ãµes</th></tr></thead><tbody id="debtRows"></tbody></table></div>`;
    const update = () => {
      const q = String(byId('debtSearch')?.value || '').toLowerCase();
      const age = Number(byId('debtAge')?.value || 0);
      const filtered = rows.filter((t) => (!q || [t.clienteNomeCalc, t.tipoTrabalho, t.referencia].join(' ').toLowerCase().includes(q)) && (!age || daysSince(t.dataInicio || t.data || t.dataFim) >= age));
      byId('debtRows').innerHTML = filtered.map((t) => `<tr><td>${esc(t.clienteNomeCalc)}</td><td>${esc(t.tipoTrabalho || t.referencia || '-')}</td><td>${fmtDate(t.dataInicio || t.data || t.dataFim)}</td><td>${daysSince(t.dataInicio || t.data || t.dataFim)}</td><td>${euro(t.debtValue)}</td><td><button class="product-action" data-pay-work="${esc(t.id)}">Marcar pago</button> <button class="product-action" data-client-profile="${esc(t.clienteNomeCalc)}">Ficha</button></td></tr>`).join('') || `<tr><td colspan="6">Sem dÃ­vidas em aberto.</td></tr>`;
    };
    byId('debtSearch')?.addEventListener('input', update);
    byId('debtAge')?.addEventListener('change', update);
    update();
  }

  function renderAgenda() {
    const body = byId('agendaProductBody');
    if (!body) return;
    const grouped = new Map();
    data().trabalhos.forEach((t) => {
      const key = String(t.dataInicio || t.dataFim || t.data || 'Sem data').slice(0, 10);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(t);
    });
    const rows = [...grouped.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).slice(0, 30);
    body.innerHTML = `<div class="product-card agenda-list">${rows.map(([day, works]) => `<div class="agenda-day"><div class="agenda-date">${fmtDate(day)}</div><div class="product-list">${works.map(workRow).join('')}</div></div>`).join('') || empty('Sem trabalhos com data.')}</div>`;
  }

  function normalizeStage(t) {
    const raw = String(t.estado || t.paymentStatus || 'Pendente').toLowerCase();
    if (raw.includes('pago')) return 'Pago';
    if (raw.includes('entreg')) return 'Entregue';
    if (raw.includes('concl')) return 'Concluído';
    if (raw.includes('curso') || raw.includes('andamento')) return 'Em curso';
    return 'Pendente';
  }
  function renderKanban() {
    const body = byId('kanbanProductBody');
    if (!body) return;
    const works = data().trabalhos;
    body.innerHTML = `<div class="product-kanban">${STAGES.map((stage) => {
      const stageWorks = works.filter((t) => normalizeStage(t) === stage).slice(0, 20);
      return `<div class="kanban-col"><h3>${stage}<span class="product-pill">${stageWorks.length}</span></h3>${stageWorks.map((t) => `<div class="kanban-card"><strong>${esc(clientNameFromWork(t))}</strong><span>${esc(t.tipoTrabalho || t.referencia || '-')}</span><span>${euro(valueWork(t))} Â· ${fmtDate(t.dataInicio || t.data || t.dataFim)}</span><select data-stage-work="${esc(t.id)}">${STAGES.map((s) => `<option value="${s}" ${s === stage ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('') || empty('Sem trabalhos.')}</div>`;
    }).join('')}</div>`;
  }

  function renderAnnual() {
    const body = byId('anualProductBody');
    if (!body) return;
    const years = [...new Set(data().pagamentos.map((p) => new Date(p.data || p.dataPagamento || Date.now()).getFullYear()).filter(Boolean))].sort((a, b) => b - a);
    const year = Number(byId('annualYear')?.value || years[0] || new Date().getFullYear());
    const pays = data().pagamentos.filter((p) => new Date(p.data || p.dataPagamento || 0).getFullYear() === year);
    const total = pays.reduce((s, p) => s + num(p.valor), 0);
    const methods = {};
    pays.forEach((p) => { methods[p.metodo || 'Sem metodo'] = (methods[p.metodo || 'Sem metodo'] || 0) + num(p.valor); });
    body.innerHTML = `<div class="product-card"><div class="product-toolbar"><select id="annualYear">${years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="product-action" data-print-annual>Imprimir relatÃ³rio</button></div></div><div class="product-grid three">${kpi('Total anual', euro(total), `${pays.length} pagamentos`)}${kpi('Ticket mÃ©dio', euro(pays.length ? total / pays.length : 0), 'Por pagamento')}${kpi('Clientes', new Set(pays.map((p) => p.cliente)).size, 'Com pagamentos')}</div><div class="product-card"><h3>MÃ©todos de pagamento</h3><div class="product-list">${Object.entries(methods).map(([m, v]) => `<div class="product-row"><div class="product-row-main"><strong>${esc(m)}</strong></div><span class="product-pill">${euro(v)}</span></div>`).join('') || empty('Sem dados no ano.')}</div></div>`;
    byId('annualYear')?.addEventListener('change', renderAnnual);
  }

  function showClientProfile(name) {
    const d = data();
    const c = clientByName(name) || { nome: name };
    const works = d.trabalhos.filter((t) => clientNameFromWork(t).toLowerCase() === String(name).toLowerCase());
    const pays = d.pagamentos.filter((p) => String(p.cliente || '').toLowerCase() === String(name).toLowerCase());
    const debt = works.filter((t) => !isPaid(t)).reduce((s, t) => s + Math.max(0, valueWork(t) - paidValue(t)), 0);
    byId('productModalTitle').textContent = `Ficha de Cliente Â· ${c.nome || name}`;
    byId('productModalBody').innerHTML = `<div class="product-grid three">${kpi('Trabalhos', works.length, 'Registos associados')}${kpi('Pagamentos', euro(pays.reduce((s, p) => s + num(p.valor), 0)), `${pays.length} pagamentos`)}${kpi('DÃ­vida', euro(debt), debt > 0 ? 'Requer cobranÃ§a' : 'Sem dÃ­vida')}</div><div class="product-grid two"><div class="product-card"><h3>Dados</h3><div class="product-list">${['telefone','email','nif','morada'].map((k) => `<div class="product-row"><div class="product-row-main"><strong>${k.toUpperCase()}</strong><span>${esc(c[k] || '-')}</span></div></div>`).join('')}</div></div><div class="product-card"><h3>Ãšltimos trabalhos</h3><div class="product-list">${works.slice(-8).reverse().map(workRow).join('') || empty('Sem trabalhos.')}</div></div></div>`;
    byId('productModal').classList.add('active');
  }

  function renderNotificationBell() {
    const items = notifications();
    const bell = byId('notificationBell');
    if (!bell) return;
    bell.innerHTML = `!${items.length ? `<span>${items.length}</span>` : ''}`;
  }

  function renderAllProduct() {
    renderNotificationBell();
    renderExecutive();
    renderDebts();
    renderAgenda();
    renderKanban();
    renderAnnual();
  }

  function bind() {
    document.addEventListener('click', (ev) => {
      const regular = ev.target.closest('[data-tab],[data-go]');
      if (!regular || regular.dataset.productTab) return;
      document.querySelectorAll('.product-page').forEach((p) => p.classList.remove('active'));
      document.querySelectorAll('[data-product-tab]').forEach((b) => b.classList.remove('active'));
    }, true);
    document.addEventListener('click', (ev) => {
      const tab = ev.target.closest('[data-product-tab]');
      if (tab) { ev.preventDefault(); switchProductTab(tab.dataset.productTab); return; }
      if (ev.target.closest('[data-product-refresh]')) { renderAllProduct(); return; }
      const pay = ev.target.closest('[data-pay-work]');
      if (pay) { if (typeof window.markAsPaid === 'function') window.markAsPaid(pay.dataset.payWork); else alert('FunÃ§Ã£o de pagamento indisponÃ­vel.'); setTimeout(renderAllProduct, 250); return; }
      const profile = ev.target.closest('[data-client-profile]');
      if (profile) { showClientProfile(profile.dataset.clientProfile); return; }
      if (ev.target.closest('[data-close-product-modal]') || ev.target.id === 'productModal') byId('productModal')?.classList.remove('active');
      if (ev.target.closest('#notificationBell')) { byId('productModalTitle').textContent = 'NotificaÃ§Ãµes'; byId('productModalBody').innerHTML = listNotifications(); byId('productModal')?.classList.add('active'); }
      if (ev.target.closest('[data-print-annual]')) window.print();
    });
    document.addEventListener('change', (ev) => {
      const sel = ev.target.closest('[data-stage-work]');
      if (!sel) return;
      const id = sel.dataset.stageWork;
      const value = sel.value;
      if (typeof window.setWorkEstadoById === 'function') window.setWorkEstadoById(id, value);
      else {
        const t = data().trabalhos.find((item) => String(item.id) === String(id));
        if (t) { t.estado = value; try { localStorage.setItem('ge_trabalhos', JSON.stringify(window.trabalhos || [])); } catch (err) {} }
      }
      setTimeout(renderAllProduct, 250);
    });
  }

  function init() {
    addNav();
    addPages();
    bind();
    renderAllProduct();
  }

  window.ProductEnhancements = { render: renderAllProduct, switchTab: switchProductTab, showClientProfile };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

