# 04 — Linha só com o que o relatório mostra

**What to build:** cada linha da extração carrega três campos de uso interno — os ids de fornecedor, OSP e escola — que servem só aos filtros. Eles não saem no CSV, mas saem na resposta json, onde quem consome pode passar a depender deles.

Depois deste ticket a linha contém exatamente as colunas do relatório, e os filtros passam a consultar um índice que vive do lado de dentro. No mesmo ticket sai a função de descoberta de colunas do módulo de csv, que é exportada e nunca importada.

**Blocked by:** 02 — Testar os três formatos da rota de extração.

**Status:** needs-info

- [ ] A resposta json devolve apenas as colunas do relatório
- [x] Os filtros por fornecedor, OSP e escola continuam funcionando por unique id
- [x] A função de descoberta de colunas do módulo de csv é removida
- [ ] Nenhum campo de uso interno atravessa a interface da extração
- [ ] Antes de fechar, confirmar com quem consome o json se alguém lê esses ids hoje

**Onde parou:** os filtros já não leem a linha — os ids vivem num índice
interno (`idsDe`, um WeakMap em `extracao-core.js`) e a função de descoberta de
colunas do csv saiu. Os três campos `_fornecedorId`, `_ospId` e `_escolaId`
continuam na linha, e portanto na resposta json, porque tirá-los quebra quem
os estiver lendo hoje. Estão marcados como compatibilidade: quando a confirmação
vier, são três linhas a apagar em `montar`, sem tocar em filtro nenhum.

**Achado da revisão:** os ids não são só de uso interno — o `README.md`
ensina a descobri-los pedindo a extração em json ("cada linha traz
`_fornecedorId` e `_ospId`"). Tirá-los da resposta é quebra de contrato
documentado, não só de contrato implícito: além de confirmar com quem consome
o json, o README precisa mudar junto, e passa a faltar uma forma de descobrir
o unique id de um fornecedor ou de uma OSP pela API.
