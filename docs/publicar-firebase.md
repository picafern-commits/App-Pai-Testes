# Publicar regras Firebase

## Antes de publicar

1. Fazer backup da Firestore ou exportar os dados pela app.
2. Confirmar que o utilizador `pica.fern@gmail.com` existe no Firebase Authentication.
3. Confirmar que os emails dos utilizadores estao em minusculas.
4. Confirmar que existem documentos em `user_roles` com IDs iguais aos emails dos utilizadores.

Exemplo de documento em `user_roles`:

```json
{
  "email": "utilizador@empresa.com",
  "role": "admin",
  "updatedAt": "2026-06-03T00:00:00.000Z"
}
```

Roles validas:

- `user`: pode ler dados.
- `admin`: pode criar, editar e apagar dados operacionais.
- `master_admin`: pode gerir utilizadores e roles.

## Publicar

Na pasta `App-Pai-main`, publicar com Firebase CLI:

```powershell
firebase deploy --only firestore:rules
```

## Verificacao rapida

- Entrar com um utilizador `user` e confirmar que consegue abrir dashboard, historico e clientes.
- Entrar com um `admin` e confirmar que consegue criar trabalho, cliente, pagamento e orcamento.
- Entrar com `master_admin` e confirmar que consegue gerir utilizadores.
- Confirmar que a pagina Auditoria abre apenas para admin/master.

## Rollback

Se algo bloquear a app, voltar temporariamente as regras anteriores apenas pelo tempo necessario para corrigir `user_roles`. Evitar manter regras abertas em producao.
