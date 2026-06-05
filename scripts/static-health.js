const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  ['desktop', path.join(root, 'Gestao', 'index.html')],
  ['mobile', path.join(root, 'Gestao-Mobile', 'index.html')],
];

function topDuplicates(items) {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 25);
}

for (const [name, file] of files) {
  const html = fs.readFileSync(file, 'utf8');
  const folder = path.dirname(file);
  const repairScript = path.join(folder, 'js', 'system-repairs.js');
  const repairSource = fs.existsSync(repairScript) ? fs.readFileSync(repairScript, 'utf8') : '';
  const swFile = path.join(folder, 'sw.js');
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(m => m[1]);
  const functions = [...html.matchAll(/\bfunction\s+([a-zA-Z0-9_$]+)/g)].map(m => m[1]);
  const windowFns = [...html.matchAll(/window\.([a-zA-Z0-9_$]+)\s*=/g)].map(m => m[1]);
  const collections = [...html.matchAll(/['"]((?:trabalhos|clientes|pagamentos|orcamentos|logs|user_roles|presence_status|app_backups))['"]/g)].map(m => m[1]);
  const navTabs = [...html.matchAll(/data-tab=["']([^"']+)["']/gi)].map(m => m[1]);
  const pages = [...html.matchAll(/id=["']([^"']+-page)["']/gi)].map(m => m[1].replace(/-page$/, ''));

  console.log(JSON.stringify({
    name,
    bytes: Buffer.byteLength(html),
    lines: html.split(/\r?\n/).length,
    ids: ids.length,
    duplicateIds: topDuplicates(ids),
    functions: functions.length,
    duplicateFunctions: topDuplicates(functions),
    windowExports: [...new Set(windowFns)].sort(),
    collections: [...new Set(collections)].sort(),
    navTabs: [...new Set(navTabs)].sort(),
    pages: [...new Set(pages)].sort(),
    tabsWithoutPage: [...new Set(navTabs)].filter(tab => !pages.includes(tab)).sort(),
    pagesWithoutTab: [...new Set(pages)].filter(page => !navTabs.includes(page)).sort(),
    hasServiceWorker: fs.existsSync(swFile) && (/serviceWorker|sw\.js/.test(html) || /serviceWorker|sw\.js/.test(repairSource)),
    hasProfessionalCss: /professional-ui\.css/.test(html),
    hasVersionToast: /ge-update-safe-script/.test(html),
  }, null, 2));
}
