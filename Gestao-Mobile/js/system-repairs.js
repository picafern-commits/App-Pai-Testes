(function () {
  'use strict';

  const BACKUP_KEYS = {
    dailyHistory: 'dailyAutoBackups',
    dailyLast: 'dailyAutoBackupLastDate',
    legacyHistory: 'backupFridayHistory',
    legacyLast: 'backupFridayDone',
    weeklyHistory: 'weeklyAutoBackups',
    weeklyLast: 'weeklyAutoBackupLastDate',
  };

  function readJsonArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (err) {
      return [];
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {}
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtSafe(value) {
    if (!value) return '--';
    if (typeof window.fmtDate === 'function') {
      try {
        return window.fmtDate(value);
      } catch (err) {}
    }
    return String(value).slice(0, 10);
  }

  function getBackups() {
    const daily = readJsonArray(BACKUP_KEYS.dailyHistory);
    if (daily.length) return daily;
    const weekly = readJsonArray(BACKUP_KEYS.weeklyHistory);
    if (weekly.length) return weekly;
    return readJsonArray(BACKUP_KEYS.legacyHistory);
  }

  function getLastBackupDay() {
    return (
      localStorage.getItem(BACKUP_KEYS.dailyLast) ||
      localStorage.getItem(BACKUP_KEYS.legacyLast) ||
      localStorage.getItem(BACKUP_KEYS.weeklyLast) ||
      ''
    );
  }

  function setBackupDoneToday() {
    const today = todayIso();
    localStorage.setItem(BACKUP_KEYS.dailyLast, today);
    localStorage.setItem(BACKUP_KEYS.legacyLast, today);
    localStorage.setItem(BACKUP_KEYS.weeklyLast, today);
  }

  function collectCurrentData() {
    const fromWindow = (name, fallbackKey) => {
      if (Array.isArray(window[name])) return window[name];
      return readJsonArray(fallbackKey);
    };
    return {
      trabalhos: fromWindow('trabalhos', 'ge_trabalhos'),
      clientes: fromWindow('clientes', 'ge_clientes'),
      pagamentos: fromWindow('pagamentos', 'ge_pagamentos'),
      orcamentos: fromWindow('orcamentos', 'ge_orcamentos'),
      dataBackup: new Date().toISOString(),
      appVersion: window.APP_VERSION || '1.2.1',
    };
  }

  function showBackupNotice() {
    const notice = document.createElement('div');
    notice.className = 'backup-repair-toast';
    notice.innerHTML = '<strong>Backup diario criado</strong><span>Os dados foram protegidos localmente.</span>';
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 4500);
  }

  function createDailyBackupIfNeeded() {
    const today = todayIso();
    if (String(getLastBackupDay()).slice(0, 10) === today) return false;

    const backups = getBackups();
    backups.push(collectCurrentData());
    while (backups.length > 30) backups.shift();

    writeJson(BACKUP_KEYS.dailyHistory, backups);
    writeJson(BACKUP_KEYS.legacyHistory, backups);
    writeJson(BACKUP_KEYS.weeklyHistory, backups);
    setBackupDoneToday();
    showBackupNotice();
    updateBackupIndicators();
    return true;
  }

  function updateBackupIndicators() {
    const backups = getBackups();
    const last = getLastBackupDay();
    const hasToday = String(last).slice(0, 10) === todayIso();

    document.querySelectorAll('#backupLastStatus, #backupLastStatusClean').forEach((el) => {
      el.textContent = fmtSafe(last);
    });
    document.querySelectorAll('#backupCountStatus, #backupCountStatusClean').forEach((el) => {
      el.textContent = String(backups.length);
    });
    document.querySelectorAll('#backupTodayStatus, #backupWeekStatus').forEach((el) => {
      el.textContent = hasToday ? 'Backup feito hoje' : (last ? 'Pendente hoje' : 'Sem backup');
    });
    document.querySelectorAll('#backupModeBadge, #backupWeekBadge').forEach((badge) => {
      badge.classList.remove('ok', 'warn', 'error');
      badge.classList.add(hasToday ? 'ok' : (last ? 'warn' : 'error'));
      badge.textContent = hasToday ? 'Diario OK' : (last ? 'Pendente hoje' : 'Sem backup');
    });
  }

  function removeDuplicateBackupCards() {
    const cards = Array.from(document.querySelectorAll('#backupToolsCard'));
    cards.slice(1).forEach((card) => card.remove());
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker indisponivel:', err);
    });
  }

  window.getLastBackupDay = getLastBackupDay;
  window.setBackupDoneToday = setBackupDoneToday;
  window.fazerBackupSexta = createDailyBackupIfNeeded;
  window.updateBackupWeekIndicator = updateBackupIndicators;

  function init() {
    removeDuplicateBackupCards();
    updateBackupIndicators();
    registerServiceWorker();
    setTimeout(() => {
      removeDuplicateBackupCards();
      updateBackupIndicators();
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
