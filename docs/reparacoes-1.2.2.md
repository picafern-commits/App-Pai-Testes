# Reparacoes 1.2.2

## Corrigido

- Adicionado `js/system-repairs.js` em desktop e mobile.
- O fluxo de backups passa a usar backup diario consistente.
- Os indicadores de backup sao atualizados em todos os paineis visiveis.
- Cartoes de backup duplicados sao removidos no arranque se aparecerem no DOM.
- Adicionado `sw.js` em desktop e mobile para cache PWA basico.
- Registo do service worker feito pelo reparador quando a app abre por HTTP/HTTPS.
- Versao atualizada para `1.2.2`.

## Mantido

- Login Firebase.
- Sincronizacao Firestore.
- Historico, clientes, pagamentos, orcamentos e relatorios.
- Camada visual profissional.
- Regras Firestore existentes.

## Ainda por fazer

- Remover definitivamente os blocos antigos duplicados de dentro dos `index.html`.
- Unificar `Gestao` e `Gestao-Mobile`.
- Testar Firebase com utilizadores reais `user`, `admin` e `master_admin`.
- Criar testes automatizados de UI.
