# Plano de melhoria da App Pai

## Prioridade 1 - estabilizacao

- Publicar regras Firestore com permissoes por perfil.
- Confirmar que todos os utilizadores Firebase tem documento em `user_roles`.
- Remover a dependencia de roles hardcoded no frontend sempre que possivel.
- Fazer backup manual antes de qualquer alteracao estrutural.

## Prioridade 2 - manutencao

- Separar o `index.html` em ficheiros dedicados:
  - `css/app.css`
  - `js/auth.js`
  - `js/firebase.js`
  - `js/trabalhos.js`
  - `js/clientes.js`
  - `js/pagamentos.js`
  - `js/orcamentos.js`
  - `js/backups.js`
  - `js/auditoria.js`
- Manter uma unica versao responsiva em vez de duas copias quase iguais (`Gestao` e `Gestao-Mobile`).
- Criar testes simples para login, renderizacao, criacao/edicao/apagar e sincronizacao.

## Prioridade 3 - produto

- Melhorar filtros do historico de trabalhos e pagamentos.
- Adicionar validacoes claras em formularios.
- Melhorar relatorios por cliente, mes e estado de pagamento.
- Criar fluxo seguro para convidar/criar utilizadores.

## Notas importantes

As regras atuais recomendadas no README antigo eram demasiado abertas porque permitiam escrita a qualquer utilizador autenticado. O ficheiro `firestore.rules` incluido neste projeto bloqueia escritas comuns para utilizadores sem perfil admin e deixa `user_roles` apenas para `master_admin`.
