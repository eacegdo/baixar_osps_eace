# 06 — Extração como um módulo, CLI e API como adapters

**What to build:** o CLI e o servidor repetem a mesma sequência de seis passos pra produzir a extração — carregar, gerar, filtrar, particionar, formatar, empacotar — e o trecho que monta o zip está duplicado nos dois. A ordem correta desses passos é conhecimento que hoje mora na cabeça de quem chama.

Depois deste ticket uma entrada recebe o cliente e as opções e devolve a extração pronta, com as saídas como métodos. CLI e servidor viram adapters: um cuida de argumentos e arquivos em disco, o outro de querystring e resposta HTTP. As peças internas continuam existindo e testáveis; o que some é a coreografia repetida.

**Blocked by:** 03 — Um seam de cache com adapter de disco e de memória; 05 — Colunas descritas em um lugar só.

**Status:** ready-for-human

**Implementado:** falta a revisão humana; veja os commits em `master`.

- [x] Uma chamada produz a extração a partir do cliente e das opções
- [x] As saídas csv, zip e json são métodos da extração
- [x] O empacotamento de zip existe num lugar só
- [x] O CLI mantém todas as opções de linha de comando de hoje, incluindo o relatório de progresso por tabela
- [x] A rota HTTP mantém todos os parâmetros e cabeçalhos de hoje
- [x] Chamar os passos fora de ordem deixa de ser possível pela interface
