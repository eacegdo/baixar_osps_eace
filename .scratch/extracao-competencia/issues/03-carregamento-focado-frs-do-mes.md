# 03 — Carregamento focado das FRs do mês e resolução pontual

**What to build:** Implementar o fluxo de carregamento reduzido em `src/extracao-core.js` (`carregarDadosMes`). Em vez de baixar todas as 41.500 FRs e todas as escolas:
1. Puxa as `FR_OSP` criadas no mês via constraint de `Created Date`.
2. Para as escolas conectadas identificadas no Ticket 01, busca quaisquer FRs adicionais dessas escolas que não vieram no passo 1.
3. Extrai a lista de IDs únicos necessários de `contrato_taxa_instalacao`, `OSP`, `Escolas` e `fornecedor`, buscando apenas o que essas FRs utilizam.
4. Reduz o número total de chamadas HTTP ao Bubble de ~1.650 para ~25.

**Blocked by:** 01 — Consulta a importação_escola e filtro de escolas conectadas.

**Status:** ready-for-human

- [x] Consulta `FR_OSP` do mês com constraint de `Created Date >= inicio` e `< fim`
- [x] Busca FRs das escolas conectadas que possuam vínculo anterior
- [x] Carrega apenas os registros dependentes de `contrato_taxa_instalacao`, `OSP`, `Escolas` e `fornecedor`
- [x] Mantém compatibilidade de formato para alimentar `gerarLinhas`
- [x] Medição de tempo e requisições confirmando redução drástica
- [x] Teste unitário com dados simulados
