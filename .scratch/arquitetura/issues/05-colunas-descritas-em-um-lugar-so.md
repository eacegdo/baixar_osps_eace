# 05 — Colunas descritas em um lugar só

**What to build:** o nome de cada uma das trinta colunas existe duas vezes — na lista que vira o cabeçalho e como chave na montagem da linha — e nada obriga as duas a concordarem. Divergir não dá erro: dá coluna vazia em silêncio, que é como o bug do valor da nota fiscal passou despercebido.

Depois deste ticket cada coluna é uma entrada só, declarando nome, de onde o valor sai e como se formata. Cabeçalho e linha derivam dessa mesma entrada, então dessincronizar deixa de ser possível. Ganho lateral: fica legível, numa tela, a origem de cada coluna — que é o que se confere contra a tela do SISOP.

**Blocked by:** 04 — Linha só com o que o relatório mostra.

**Status:** ready-for-human

**Implementado:** falta a revisão humana; veja os commits em `master`.

- [x] Cada coluna é declarada uma vez, com nome, origem e formato
- [x] O cabeçalho do CSV e as chaves da linha vêm da mesma declaração
- [x] Adicionar uma coluna exige editar um lugar só
- [x] Um teste garante que cabeçalho e linha não podem divergir
- [x] As regras que não são cópia direta de campo continuam expressáveis
- [x] Nenhuma célula muda de valor — os testes de 02 seguem passando
