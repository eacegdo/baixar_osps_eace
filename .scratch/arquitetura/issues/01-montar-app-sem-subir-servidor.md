# 01 — Montar o app sem subir servidor

**What to build:** hoje importar o módulo do servidor sobe o servidor e prende a porta, então nada da superfície HTTP é exercitável. Depois deste ticket, montar o app e usá-lo num teste são coisas separadas: uma função devolve a instância pronta e o entrypoint apenas escuta. Com isso já dá pra afirmar, sem porta e sem rede, que `/health` responde sem chave e que uma rota protegida recusa quem não apresenta a chave de API.

É o prefactor de todos os outros tickets: sem ele nenhum tem como provar que não quebrou nada.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Importar o módulo do app não escuta em porta nenhuma
- [x] O entrypoint continua subindo o servidor como hoje, incluindo o log da documentação
- [x] `/health` responde 200 sem chave de API
- [x] `/docs` segue aberto sem chave
- [x] Rota protegida responde 401 sem chave e 200 com a chave, tanto no header próprio quanto no `Authorization: Bearer`
- [x] Com a chave de API desligada no ambiente, nenhuma rota exige chave
- [x] Os testes rodam por injeção de requisição, sem abrir porta
