# Estado tecnico

## O que a app ja faz

- Login Firebase por email e palavra-passe.
- Perfis `user`, `admin` e `master_admin`.
- Dashboard operacional.
- Gestao de trabalhos, clientes, pagamentos e orcamentos.
- Relatorios e PDFs.
- Auditoria com exportacao JSON/CSV.
- Sincronizacao Firestore em tempo real.
- Backups locais e backups em Firestore.
- Presenca de utilizadores online.
- PWA com manifest e icones.

## Riscos atuais

- O codigo principal esta concentrado num unico `index.html`.
- Existem duas copias da app: `Gestao` e `Gestao-Mobile`.
- As permissoes ainda dependem bastante do frontend.
- O armazenamento mistura Firestore, `localStorage` e chaves antigas.
- A presenca online usa IDs derivados do email, por isso as regras permitem escrita autenticada em `presence_status`.
- O bootstrap de master admin esta configurado para `pica.fern@gmail.com` em `firestore.rules`.

## Melhor proximo passo

Separar a app em ficheiros sem mudar comportamento:

1. Extrair CSS para `css/app.css`.
2. Extrair Firebase/auth para `js/firebase.js` e `js/auth.js`.
3. Extrair dados e renderizacao por modulo.
4. Manter `index.html` como entrada unica.
5. Depois unificar `Gestao` e `Gestao-Mobile`.

Esta ordem reduz o risco de partir login, sincronizacao ou permissoes.
