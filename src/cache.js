import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Interface de cache. Existem dois adapters: o de disco, que guarda as tabelas
 * cruas entre execuções, e o de memória, que guarda as linhas prontas dentro
 * de um processo. Os dois obedecem às mesmas três regras:
 *
 * - entrada válida e sem `atualizar`: devolve o que está guardado;
 * - `atualizar`: produz dado fresco **e regrava** — é o botão "atualizar";
 * - `ttl` 0: produz dado fresco e **não grava**, para um dado avulso não virar
 *   o novo estado.
 *
 * Uma produção que falha nunca deixa resultado guardado: a chamada seguinte
 * tenta de novo.
 *
 * @typedef {object} Cache
 * @property {(chave: string, produzir: () => Promise<any>, opcoes?: {ttl?: number, atualizar?: boolean}) => Promise<{dados: any, doCache: boolean}>} obter
 *   `doCache` diz se o valor veio de algo já guardado, ou seja, se `produzir`
 *   não foi chamado.
 */

/**
 * Cache em disco, um arquivo JSON por chave. Uma extração completa baixa ~165
 * mil registros; reexecutar logo em seguida (ajuste de formato, outro recorte)
 * não deveria pagar isso de novo.
 *
 * @returns {Cache}
 */
export function cacheEmDisco({ dir = process.env.CACHE_DIR ?? '.cache' } = {}) {
  const caminho = (chave) => path.join(dir, `${chave.replace(/[^\w-]/g, '_')}.json`);

  return {
    async obter(chave, produzir, { ttl = 0, atualizar = false } = {}) {
      if (!ttl) return { dados: await produzir(), doCache: false };

      const arquivo = caminho(chave);
      try {
        const { mtimeMs } = await stat(arquivo);
        if (!atualizar && Date.now() - mtimeMs < ttl * 1000) {
          return { dados: JSON.parse(await readFile(arquivo, 'utf8')), doCache: true };
        }
      } catch {
        // sem cache válido: segue e baixa
      }

      const dados = await produzir();
      await mkdir(dir, { recursive: true });
      await writeFile(arquivo, JSON.stringify(dados));
      return { dados, doCache: false };
    },
  };
}

/**
 * Cache em memória, com a promessa como valor guardado. Guardar a promessa (e
 * não o resultado) é o que faz requisições concorrentes com o mesmo recorte
 * compartilharem uma produção só: dois cliques no botão não baixam as cinco
 * tabelas duas vezes.
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.limiteEmVooMs] teto da janela em que uma produção
 *   ainda não terminada é reaproveitada. É o que impede uma extração travada de
 *   prender todas as chamadas seguintes: passado o teto, a próxima começa outra.
 * @returns {Cache}
 */
export function cacheEmMemoria({ limiteEmVooMs = 300_000 } = {}) {
  const entradas = new Map();

  return {
    async obter(chave, produzir, { ttl = 0, atualizar = false } = {}) {
      const guardada = entradas.get(chave);
      if (guardada && !atualizar && ttl > 0 && Date.now() < guardada.expiraEm) {
        return { dados: await guardada.promessa, doCache: true };
      }

      const entrada = {
        // Enquanto a produção corre, a validade cobre só a janela em voo, para
        // as chamadas concorrentes se juntarem a ela; ao terminar vale o ttl
        // cheio. Uma produção que trava expira junto com a janela.
        expiraEm: Date.now() + limiteEmVooMs,
        promessa: produzir(),
      };
      // `ttl` 0 não grava: a produção corre solta e nada substitui o que já
      // está guardado.
      if (ttl > 0) entradas.set(chave, entrada);

      entrada.promessa.then(
        () => { entrada.expiraEm = Date.now() + ttl * 1000; },
        () => { if (entradas.get(chave) === entrada) entradas.delete(chave); },
      );

      return { dados: await entrada.promessa, doCache: false };
    },
  };
}
