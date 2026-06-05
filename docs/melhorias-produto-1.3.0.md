# Melhorias de produto 1.3.0

## Sistemas adicionados

- Dashboard Executivo.
- Pagina de Cobrancas.
- Agenda operacional.
- Kanban de trabalhos.
- Relatorio Anual.
- Ficha completa de Cliente.
- Centro de notificacoes.

## Ficheiros novos

- `Gestao/css/product-enhancements.css`
- `Gestao/js/product-enhancements.js`
- `Gestao-Mobile/css/product-enhancements.css`
- `Gestao-Mobile/js/product-enhancements.js`

## Como funciona

A camada `product-enhancements.js` le os dados ja existentes da app:

- `trabalhos`
- `clientes`
- `pagamentos`
- `orcamentos`

Tambem usa `localStorage` como fallback quando os dados ainda nao chegaram do Firebase.

## Sistemas

### Dashboard Executivo

Mostra KPIs de trabalhos abertos, valores por receber, recebido no mes, orcamentos pendentes, alertas e evolucao mensal.

### Cobrancas

Lista trabalhos com valor em aberto e permite marcar como pago usando a funcao atual `markAsPaid`.

### Agenda

Agrupa trabalhos por data para planeamento.

### Kanban

Mostra pipeline por estado:

- Pendente
- Em curso
- Concluido
- Entregue
- Pago

### Relatorio Anual

Resume pagamentos por ano, ticket medio, clientes e metodos.

### Ficha de Cliente

Mostra dados, trabalhos, pagamentos e divida por cliente.

### Notificacoes

Cria avisos para dividas, orcamentos parados, trabalhos sem data final e backups em atraso.

## Ainda recomendado

- Testar com Firebase real.
- Refinar textos/acento visual depois de ver em browser.
- Unificar desktop/mobile numa so app responsiva.
