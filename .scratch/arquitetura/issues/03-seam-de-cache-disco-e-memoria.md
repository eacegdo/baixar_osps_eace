# 03 — Um seam de cache com adapter de disco e de memória

**What to build:** existem duas camadas de cache com a mesma ideia e formas diferentes: a de disco, que guarda as tabelas cruas, e a de memória do servidor, que guarda as linhas prontas e junta requisições concorrentes na mesma extração. A segunda concentra a lógica mais sutil do projeto e está fora de qualquer teste.

Depois deste ticket as duas ficam atrás da mesma interface, como dois adapters, e o comportamento delicado passa a ser verificável sem HTTP: dois pedidos simultâneos compartilham uma extração só, uma falha não deixa resultado ruim guardado, e `atualizar` e `ttl 0` significam a mesma coisa nos dois adapters.

**Blocked by:** 02 — Testar os três formatos da rota de extração.

**Status:** done

- [x] Disco e memória satisfazem a mesma interface de cache
- [x] Duas chamadas concorrentes com o mesmo recorte produzem uma extração só
- [x] Uma extração que falha é descartada, e a chamada seguinte tenta de novo
- [x] `atualizar` baixa dado fresco e regrava o que estiver guardado
- [x] `ttl 0` busca dado fresco sem regravar
- [x] Versões live e test não compartilham entrada
- [x] O comportamento observável da rota não muda — os testes de 02 seguem passando
