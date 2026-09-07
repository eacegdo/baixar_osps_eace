# 02 — Regra da coluna Previsão de execução com data_relatorio

**What to build:** Ajustar a definição da coluna `Previsão de execução` em `src/extracao-core.js` para receber o contexto de escolas conectadas no mês. Se a escola da linha (verificada pelo INEP ou pelo ID da escola) estiver no mapa de escolas conectadas no mês, a coluna exibe a `data_relatorio` da importação formatada como `dd/mm/aaaa`. Caso contrário, mantém o fallback atual: `item?.['Previsão de execução'] ?? osp['Previsão de entrega']`.

**Blocked by:** 01 — Consulta a importação_escola e filtro de escolas conectadas.

**Status:** ready-for-human

- [x] A definição da coluna `Previsão de execução` verifica se a escola da linha possui `data_relatorio` associada
- [x] Quando possui, exibe a `data_relatorio` formatada via helper `data()` (`dd/mm/aaaa`)
- [x] Quando não possui, mantém exatamente a lógica existente (`item?.['Previsão de execução'] ?? osp['Previsão de entrega']`)
- [x] Não afeta as outras 29 colunas do relatório
- [x] Testes unitários com casos: escola conectada no mês, escola não conectada no mês, escola sem registro em importação
