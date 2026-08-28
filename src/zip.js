import { zip as zipCallback } from 'fflate';
import { promisify } from 'node:util';

const zipAsync = promisify(zipCallback);
const encoder = new TextEncoder();

/**
 * Empacota { nome: conteúdo } num zip em memória. A extração inteira dá ~1,6 MB
 * comprimida, então não vale a complexidade de escrever em disco antes.
 */
export async function zipArquivos(arquivos) {
  const entradas = Object.fromEntries(
    arquivos.map(({ nome, conteudo }) => [nome, encoder.encode(conteudo)]),
  );
  return Buffer.from(await zipAsync(entradas, { level: 6 }));
}
