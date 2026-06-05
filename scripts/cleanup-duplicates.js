const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  path.join(root, 'Gestao', 'index.html'),
  path.join(root, 'Gestao-Mobile', 'index.html'),
];

function removeLastRange(source, startMarker, endMarker, label) {
  const start = source.lastIndexOf(startMarker);
  if (start < 0) throw new Error(`Nao encontrei inicio de ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Nao encontrei fim de ${label}`);
  return source.slice(0, start) + source.slice(end);
}

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  html = removeLastRange(
    html,
    'document.addEventListener("DOMContentLoaded", function(){',
    'function getReportWorkList(){',
    'backup duplicado'
  );
  html = removeLastRange(
    html,
    'function getReportWorkList(){',
    'function populateOrcamentoClientOptions',
    'relatorios duplicados'
  );
  fs.writeFileSync(file, html);
  console.log(`Limpo: ${file}`);
}
