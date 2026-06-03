# Checklist QA

## Antes de testar

- Fazer backup manual pela app.
- Confirmar que o Firebase Authentication tem os utilizadores necessarios.
- Confirmar documentos em `user_roles`.
- Abrir a app em desktop e mobile.

## Login

- Entrar com utilizador `user`.
- Entrar com utilizador `admin`.
- Entrar com utilizador `master_admin`.
- Confirmar que logout limpa a sessao.
- Confirmar que "lembrar login" guarda apenas o email.

## Permissoes

- `user` consegue ler dashboard, historico, clientes, pagamentos e relatorios.
- `user` nao consegue criar, editar ou apagar.
- `admin` consegue criar, editar e apagar trabalhos, clientes, pagamentos e orcamentos.
- `master_admin` consegue gerir utilizadores.
- Auditoria aparece apenas para admin/master.

## Dados

- Criar cliente.
- Criar trabalho associado a cliente.
- Marcar trabalho como pago.
- Confirmar que o pagamento aparece na pagina Pagamentos.
- Criar orcamento.
- Aprovar orcamento e confirmar criacao de trabalho.
- Apagar registos e confirmar que desaparecem depois de atualizar a pagina.

## Sincronizacao

- Abrir a app em dois dispositivos.
- Criar trabalho num dispositivo.
- Confirmar que aparece no outro.
- Alterar pagamento num dispositivo.
- Confirmar atualizacao no outro.
- Testar a app sem internet e confirmar que abre em modo local.

## Backups

- Exportar backup JSON.
- Importar backup JSON num ambiente de teste.
- Confirmar data e contagem do ultimo backup.
- Confirmar backups em `app_backups` no Firestore.

## Relatorios e PDFs

- Gerar PDF de trabalho.
- Gerar PDF de cliente.
- Gerar PDF de pagamento.
- Gerar relatorio mensal.
- Confirmar acentos, valores em euros e datas.

## Mobile

- Testar navegacao inferior.
- Confirmar que tabelas/cartoes nao cortam texto importante.
- Confirmar formularios em ecras pequenos.
- Confirmar que botoes principais ficam acessiveis.
