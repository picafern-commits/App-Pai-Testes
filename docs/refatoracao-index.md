# Refatoracao do index.html

## Objetivo

Transformar a app de um ficheiro unico para uma estrutura modular sem mudar comportamento.

## Inventario atual

- `Gestao/index.html`: entrada desktop.
- `Gestao-Mobile/index.html`: entrada mobile.
- CSS, HTML e JS estao misturados.
- A app contem varios blocos `<style>` e `<script>`.
- Firebase e regras de permissao existem no frontend, mas as regras reais devem viver em `firestore.rules`.

## Fase 1 - extrair sem alterar comportamento

1. Criar `Gestao/css/app.css`.
2. Mover apenas o primeiro bloco `<style>` para `app.css`.
3. Referenciar com `<link rel="stylesheet" href="css/app.css">`.
4. Testar login, dashboard, formularios e mobile.
5. Repetir para `Gestao-Mobile` apenas depois de validar desktop.

## Fase 2 - separar scripts neutros

Extrair funcoes que nao dependem de estado global complexo:

- formatacao de datas;
- formatacao de euros;
- escape HTML;
- download de ficheiros;
- impressao/PDF;
- helpers de DOM.

Destino recomendado:

- `Gestao/js/utils.js`
- `Gestao/js/print.js`

## Fase 3 - separar Firebase

Mover configuracao e helpers Firebase para:

- `Gestao/js/firebase-core.js`
- `Gestao/js/auth.js`
- `Gestao/js/sync.js`

Depois desta fase, fica mais facil testar permissoes e sincronizacao.

## Fase 4 - separar dominios

Mover por area funcional:

- `js/trabalhos.js`
- `js/clientes.js`
- `js/pagamentos.js`
- `js/orcamentos.js`
- `js/relatorios.js`
- `js/backups.js`
- `js/auditoria.js`

## Fase 5 - unificar desktop e mobile

Depois de desktop estar modular, a versao mobile deve deixar de ser uma copia separada. A melhor abordagem e uma unica app responsiva com CSS adaptativo.

## Regra de ouro

Cada fase deve acabar com a app a abrir, login funcional, dados visiveis e sem erros de consola.
