ZIP limpo e corrigido

O que foi corrigido:
- removidas as pastas de TESTE
- corrigido storageBucket para appspot.com
- corrigido erro de sintaxe em genId() que bloqueava o arranque do script
- melhorada a mensagem quando a app é aberta em file://

Como testar corretamente:
1) Publica no GitHub Pages OU usa um servidor local
2) Não abras o index.html diretamente em file://
3) No Firebase, ativa Authentication > Sign-in method > Anonymous
4) Em Firestore Rules, usa pelo menos: allow read, write: if request.auth != null;

Pastas principais:
- Gestao/
- Gestao-Mobile/
