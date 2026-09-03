// Monta a instância do Fastify com todas as rotas, sem escutar em porta
// nenhuma. Quem escuta é o `server.js`; assim um teste monta o mesmo app e
// exercita a superfície HTTP por injeção de requisição.
import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { criarClient } from './client.js';
import { COLUNAS, carregarDados, gerarLinhas, filtrar, particionar, csvCompleto } from './extracao-core.js';
import { zipArquivos } from './zip.js';
import { nomeSeguro } from './formato.js';

const carimbo = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');

/**
 * Um cliente por versão do app no Bubble, criados na primeira chamada, para
 * quem só usa a live não pagar nada pela test.
 */
export function clientsPorVersao(criar = criarClient) {
  const clients = new Map();
  return (versao) => {
    if (!clients.has(versao)) clients.set(versao, criar(versao));
    return clients.get(versao);
  };
}

/**
 * @param {object} [opcoes]
 * @param {string} [opcoes.apiKey] se definida, exigida em toda rota menos /health e /docs
 * @param {number} [opcoes.cacheTtl] validade padrão do cache, em segundos
 * @param {(versao: string) => object} [opcoes.clientDe] fonte de dados; em
 *   produção são os clientes do Bubble, num teste são tabelas falsas
 * @param {boolean|object} [opcoes.logger] logger do Fastify
 */
export async function criarApp({
  apiKey = process.env.API_KEY,
  cacheTtl = Number(process.env.CACHE_TTL ?? 900),
  clientDe = clientsPorVersao(),
  logger = true,
} = {}) {
  const app = Fastify({ logger });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Extração OSP',
        description: 'Gera a extração completa de OSP a partir das tabelas do Bubble.',
        version: '1.0.0',
      },
      tags: [{ name: 'extração', description: 'Relatório formatado de OSP' }],
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' },
        },
      },
      security: [{ apiKey: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  /** Comparação de tempo constante, para a chave não vazar por timing. */
  const chaveConfere = (recebida) => {
    const a = Buffer.from(String(recebida));
    const b = Buffer.from(apiKey);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  app.addHook('onRequest', async (request, reply) => {
    if (!apiKey) return;
    // /health fica aberto: é ele que o healthcheck do Docker chama.
    // /docs também, para a página abrir e você clicar em Authorize.
    if (request.url === '/health' || request.url.startsWith('/docs')) return;

    const header = request.headers['x-api-key'] ?? '';
    const bearer = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!chaveConfere(header) && !chaveConfere(bearer)) {
      return reply.code(401).send({ error: 'chave de API ausente ou inválida' });
    }
  });

  /**
   * As linhas prontas ficam em memória por `ttl` segundos. Duas coisas dependem
   * disso: requisições concorrentes compartilham a mesma extração (dois cliques
   * no botão não baixam as cinco tabelas duas vezes) e requisições seguidas não
   * pagam de novo a releitura do cache em disco (~225 MB de JSON) nem a montagem
   * das ~40 mil linhas. Uma entrada por versão: live e test não se misturam.
   */
  const memoria = new Map();

  /**
   * `atualizar` ignora o que está guardado (memória e disco), baixa do Bubble e
   * regrava os dois — é o botão "atualizar". `ttl` 0 passa por fora do cache sem
   * regravar nada, para um dado avulso que não deve virar o novo estado.
   */
  async function extrair(ttl, atualizar, versao) {
    const guardada = memoria.get(versao);
    if (guardada && !atualizar && ttl > 0 && Date.now() < guardada.expiraEm) return guardada.promessa;

    const entrada = {
      // Enquanto a extração corre, a validade cobre só o tempo dela, para as
      // requisições concorrentes se juntarem; ao terminar vale o ttl cheio.
      expiraEm: Date.now() + 300_000,
      promessa: carregarDados(clientDe(versao), { ttl, atualizar }).then(gerarLinhas),
    };
    memoria.set(versao, entrada);

    entrada.promessa.then(
      () => { entrada.expiraEm = Date.now() + ttl * 1000; },
      () => { if (memoria.get(versao) === entrada) memoria.delete(versao); },
    );
    return entrada.promessa;
  }

  // -------------------------------------------------------------- extração

  app.get(
    '/extracao',
    {
      schema: {
        tags: ['extração'],
        summary: 'Extração completa de OSP',
        description:
          'Uma linha por item de OSP, com as colunas do relatório oficial. ' +
          'O formato zip separa um arquivo por fornecedor.',
        querystring: {
          type: 'object',
          properties: {
            formato: { type: 'string', enum: ['csv', 'zip', 'json'], default: 'csv', description: 'Formato da resposta' },
            fornecedor: { type: 'string', description: 'Nome do fornecedor ou o unique id dele. * (ou vazio) traz todos' },
            fornecedor_id: { type: 'string', description: 'Unique id do fornecedor no Bubble (ex.: 1774638667943x152870812523466340)' },
            osp_id: { type: 'string', description: 'Unique id da OSP no Bubble' },
            status: { type: 'string', description: 'Status da OSP. * (ou vazio) traz todos' },
            osp: { type: 'string', description: 'Número definitivo ou provisório da OSP, ou o unique id dela. * (ou vazio) traz todos' },
            sep: { type: 'string', minLength: 1, maxLength: 1, default: ',', description: 'Separador do CSV; use ; para Excel brasileiro' },
            bom: { type: 'boolean', default: true, description: 'BOM UTF-8, para o Excel ler os acentos' },
            linhas: { type: 'integer', minimum: 1, default: 1500, description: 'Máximo de linhas por arquivo no zip' },
            atualizar: { type: 'boolean', default: false, description: 'Ignora o cache, baixa do Bubble e regrava o cache. Use quando quiser dado atualizado' },
            ttl: { type: 'integer', minimum: 0, description: 'Validade do cache em segundos; 0 busca dado fresco sem regravar o cache' },
            versao: { type: 'string', enum: ['live', 'test'], default: 'live', description: 'Versão do app no Bubble: live ou test (/version-test)' },
            arquivo: { type: 'string', minLength: 1, maxLength: 120, description: 'Nome do arquivo baixado, sem extensão. Padrão: extracao_osp-<carimbo>' },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        formato, sep, bom, linhas: maxLinhas, ttl, atualizar, arquivo, versao,
        fornecedor, fornecedor_id: fornecedorId, status, osp, osp_id: ospId,
      } = request.query;
      // O nome vem do cliente e vai para um header: passa pelo nomeSeguro para
      // não escapar da aspa do Content-Disposition nem virar caminho.
      const nomeBase = arquivo
        ? nomeSeguro(arquivo.replace(/\.(csv|zip)$/i, ''))
        : `extracao_osp${versao === 'test' ? '-test' : ''}-${carimbo()}`;
      reply.header('X-Bubble-Version', versao);
      const linhas = filtrar(await extrair(ttl ?? cacheTtl, atualizar, versao), {
        fornecedor, fornecedorId, status, numOsp: osp, ospId,
      });
      reply.header('X-Row-Count', String(linhas.length));

      if (formato === 'json') return { linhas: linhas.length, colunas: COLUNAS, dados: linhas };

      if (formato === 'zip') {
        const arquivos = particionar(linhas, maxLinhas).map((a) => ({
          nome: a.nome,
          conteudo: csvCompleto(a.linhas, sep),
        }));
        return reply
          .header('Content-Type', 'application/zip')
          .header('Content-Disposition', `attachment; filename="${nomeBase}.zip"`)
          .header('X-File-Count', String(arquivos.length))
          .send(await zipArquivos(arquivos));
      }

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${nomeBase}.csv"`)
        .send(csvCompleto(linhas, sep, bom));
    },
  );

  app.get(
    '/health',
    { schema: { tags: ['extração'], summary: 'Verifica se a API está no ar' } },
    async () => ({ status: 'ok' }),
  );

  app.setErrorHandler((err, request, reply) => {
    request.log.error({ err }, 'requisição falhou');
    const status = err.validation ? 400 : (err.statusCode && err.statusCode < 500 ? err.statusCode : 502);
    reply.code(status).send({ error: err.message });
  });

  return app;
}
