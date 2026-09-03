# baixar_osps

Extração completa de OSP: junta cinco tabelas do Bubble (`FR_OSP`,
`contrato_taxa_instalacao`, `OSP`, `Escolas`, `fornecedor`) numa planilha com uma
linha por item de OSP. Serve o CLI (`npm run extracao`) e a API (`npm start`).
Uso, parâmetros e origem de cada coluna estão no `README.md`.

## Agent skills

### Issue tracker

Markdown local — issues e specs ficam em `.scratch/<feature-slug>/`, não no
GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

Os cinco papéis canônicos, sem renomear: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — um `CONTEXT.md` e `docs/adr/` na raiz, ambos criados sob demanda.
See `docs/agents/domain.md`.
