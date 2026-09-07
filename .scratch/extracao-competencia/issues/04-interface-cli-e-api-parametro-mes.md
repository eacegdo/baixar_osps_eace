# 04 — Interface CLI e API: parâmetro de mês e competência

**What to build:** Expor o novo modo de extração tanto no CLI (`src/extracao.js`) quanto na API HTTP (`src/app.js` e documentação Swagger).

No CLI:
- `npm run extracao -- --mes atual` (ou simplesmente `--mes 2026-09`)
- Flag `--completo` para forçar o dump histórico legado quando necessário

Na API:
- Parâmetro `?mes=atual` ou `?mes=2026-09` na rota `GET /extracao`
- Atualização do schema do Swagger em `app.js` para documentar o novo parâmetro

Na documentação:
- Atualizar `README.md` explicando o parâmetro `--mes`, a nova regra da data de conexão e o comparativo de desempenho.

**Blocked by:** 02 — Regra da coluna Previsão de execução com data_relatorio, 03 — Carregamento focado das FRs do mês e resolução pontual.

**Status:** ready-for-human

- [x] CLI aceita `--mes atual` e `--mes YYYY-MM`
- [x] API aceita `?mes=atual` e `?mes=YYYY-MM`
- [x] Swagger documenta o parâmetro `mes`
- [x] Saídas `csv`, `zip` e `json` funcionam idênticas ao fluxo legado
- [x] README atualizado com exemplos de uso e explicação da regra
- [x] Testes de integração de CLI e API cobrindo o novo parâmetro
