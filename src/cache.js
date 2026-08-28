import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIR = process.env.CACHE_DIR ?? '.cache';

/**
 * Cache em disco por tabela. Uma extração completa baixa ~165 mil registros;
 * reexecutar logo em seguida (ajuste de formato, outro recorte) não deveria
 * pagar isso de novo. TTL em segundos; 0 desliga.
 *
 * `ignorar` é diferente de ttl 0: baixa dado fresco mas **grava** o resultado,
 * ou seja, renova o cache em vez de passar por fora dele. É o que "atualizar"
 * quer dizer — sem isso, forçar dado fresco deixaria o disco velho e a próxima
 * chamada baixaria tudo de novo.
 *
 * @returns {Promise<{dados: any, doCache: boolean}>}
 */
export async function comCache(chave, ttlSegundos, produzir, { ignorar = false } = {}) {
  if (!ttlSegundos) return { dados: await produzir(), doCache: false };

  const arquivo = path.join(DIR, `${chave.replace(/[^\w-]/g, '_')}.json`);
  try {
    const { mtimeMs } = await stat(arquivo);
    if (!ignorar && Date.now() - mtimeMs < ttlSegundos * 1000) {
      return { dados: JSON.parse(await readFile(arquivo, 'utf8')), doCache: true };
    }
  } catch {
    // sem cache válido: segue e baixa
  }

  const dados = await produzir();
  await mkdir(DIR, { recursive: true });
  await writeFile(arquivo, JSON.stringify(dados));
  return { dados, doCache: false };
}
