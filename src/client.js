import { BubbleClient } from './bubble.js';

const VERSOES = ['live', 'test'];

/**
 * A versão do app no Bubble vive na URL: a live é `/api/1.1/obj` e a de
 * desenvolvimento é `/version-test/api/1.1/obj`. Em vez de pedir duas variáveis
 * de ambiente, derivamos uma da outra — assim o `.env` continua com uma URL só,
 * apontada para onde o usuário quiser, e a outra versão sai daí.
 */
export function urlDaVersao(baseUrl, versao = 'live') {
  const limpa = baseUrl.replace(/\/+$/, '').replace('/version-test/', '/');
  return versao === 'test' ? limpa.replace('/api/1.1/', '/version-test/api/1.1/') : limpa;
}

/** Cliente único, com as credenciais do ambiente e limite global de requisições. */
export function criarClient(versao = 'live') {
  const { BUBBLE_BASE_URL, BUBBLE_TOKEN, BUBBLE_TOKEN_TEST, BUBBLE_CONCURRENCY } = process.env;
  if (!BUBBLE_BASE_URL || !BUBBLE_TOKEN) {
    console.error('BUBBLE_BASE_URL e BUBBLE_TOKEN são obrigatórios (use --env-file=.env)');
    process.exit(1);
  }
  if (!VERSOES.includes(versao)) throw new Error(`versão inválida: ${versao} (use ${VERSOES.join(' ou ')})`);

  // O token da live costuma valer para as duas versões; BUBBLE_TOKEN_TEST só é
  // preciso quando o app tem tokens separados.
  const token = versao === 'test' ? (BUBBLE_TOKEN_TEST || BUBBLE_TOKEN) : BUBBLE_TOKEN;
  const client = new BubbleClient(urlDaVersao(BUBBLE_BASE_URL, versao), token, {
    concurrency: Number(BUBBLE_CONCURRENCY ?? 16),
  });
  client.versao = versao;
  return client;
}
