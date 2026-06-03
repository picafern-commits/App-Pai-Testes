# Modelo de dados

## Colecoes Firestore

### `trabalhos`

Registos de trabalhos. A app usa `id`, cliente, contacto, tipo de trabalho, datas, estado, descricao, valores, historico e informacao de pagamento.

### `clientes`

Registos de clientes. Campos esperados: nome, telefone, email, NIF e morada.

### `pagamentos`

Pagamentos associados a trabalhos/clientes. Inclui valor, data, metodo, referencia e tipo de fatura.

### `orcamentos`

Orcamentos com estado e fluxo de aprovacao/rejeicao. Quando aprovados podem gerar trabalhos.

### `logs`

Auditoria da app. A app cria entradas com acao, utilizador, role, data e detalhes. As regras permitem leitura apenas a admin/master e bloqueiam edicao/apagar.

### `user_roles`

Perfis dos utilizadores. O ID do documento deve ser o email do utilizador, preferencialmente em minusculas.

Exemplo:

```json
{
  "email": "utilizador@empresa.com",
  "role": "admin"
}
```

### `presence_status`

Estado online dos utilizadores. A app grava documentos derivados do email do utilizador.

### `app_backups`

Backups cloud criados pela app.

## Chaves locais

- `ge_trabalhos`
- `ge_clientes`
- `ge_pagamentos`
- `ge_orcamentos`
- `ge_last_trab_id`
- `app_users`
- `dailyAutoBackups`
- `backupFridayHistory`

## Nota de manutencao

Antes de mudar o modelo, criar uma migracao clara. A app ainda consulta algumas chaves antigas, por isso remover uma chave sem migrar pode fazer parecer que os dados desapareceram.
