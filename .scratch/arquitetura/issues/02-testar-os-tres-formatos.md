# 02 — Testar os três formatos da rota de extração

**What to build:** a rota de extração devolve csv, zip e json e hoje nenhum dos três é verificado. Depois deste ticket o app aceita a fonte de dados de fora, então um teste monta tabelas falsas — algumas FRs, itens, OSPs, escolas e fornecedores — e confere o que sai em cada formato, incluindo os filtros e os cabeçalhos que o navegador usa pra nomear o download.

A partir daqui existe rede de segurança pros tickets seguintes.

**Blocked by:** 01 — Montar o app sem subir servidor.

**Status:** done

- [x] O app recebe a fonte de dados por injeção; em produção segue usando o cliente do Bubble
- [x] `formato=csv` devolve o cabeçalho do relatório, uma linha por item, separador configurável e BOM quando pedido
- [x] `formato=zip` devolve um arquivo por fornecedor, respeitando o máximo de linhas por arquivo
- [x] `formato=json` devolve a contagem de linhas, a lista de colunas e os dados
- [x] Os filtros por fornecedor, por status e por número de OSP (definitivo, provisório e unique id) recortam o resultado
- [x] O nome do arquivo baixado segue o padrão, respeita o nome pedido pelo cliente e não escapa das aspas do cabeçalho
- [x] Os cabeçalhos de contagem de linhas, contagem de arquivos e versão do Bubble saem preenchidos
