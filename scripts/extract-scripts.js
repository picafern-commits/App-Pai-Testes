const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'Gestao', 'index.html'),
  path.join(root, 'Gestao-Mobile', 'index.html'),
];
const outDir = path.join(root, `.audit-extracted-${Date.now()}`);

fs.mkdirSync(outDir, { recursive: true });

for (const target of targets) {
  const html = fs.readFileSync(target, 'utf8');
  const base = target.includes('Gestao-Mobile') ? 'mobile' : 'desktop';
  const matches = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  matches.forEach((match, index) => {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const isModule = /type\s*=\s*["']module["']/i.test(attrs);
    const ext = isModule ? 'mjs' : 'js';
    fs.writeFileSync(path.join(outDir, `${base}-script-${index + 1}.${ext}`), body);
  });
}

console.log(outDir);
