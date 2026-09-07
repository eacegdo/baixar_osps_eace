# 01 — Consulta a importação_escola e filtro de escolas conectadas

**What to build:** Função que busca registros da tabela `importação_escola` no Bubble filtrados pela coluna `data_relatorio` dentro de um mês (competência). A função agrupa os registros por escola (`inep`), guarda a `data_relatorio` mais recente de cada escola e filtra apenas aquelas cujo `Status Geral` em `Escolas` seja igual a `Conectada`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] Consulta `importação_escola` aplicando constraint de `data_relatorio >= inicio` e `data_relatorio < fim` diretamente na API do Bubble
- [x] Agrupa por `inep`, elegendo a `data_relatorio` mais recente para cada escola
- [x] Valida contra os dados de `Escolas` mantendo apenas escolas com `Status Geral === 'Conectada'`
- [x] Retorna mapa de `inep -> data_relatorio` e conjunto de IDs das escolas conectadas no mês
- [x] Teste unitário cobrindo o agrupamento, filtro de status e tratamento de datas
