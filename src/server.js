import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { criarClient } from './client.js';
import { COLUNAS, carregarDados, gerarLinhas, filtrar, particionar, csvCompleto } from './extracao-core.js';
import { zipArquivos } from './zip.js';

const API_KEY = process.env.API_KEY; // opcional, protege esta API
const PORT = Number(process.env.PORT ?? 8080);
const CACHE_TTL = Number(process.env.CACHE_TTL ?? 900);

const client = criarClient();
const app = Fastify({ logger: true });

await app.register(swagger, {
  openapi: {
    info: {
      title: 'Extração OSP',
      description: 'Gera a extração completa de OSP a partir das tabelas do Bubble.',
      version: '1.0.0',
    },
    tags: [{ name: 'extração', description: 'Relatório formatado de OSP' }],
  },
});
await app.register(swaggerUi, { routePrefix: '/docs' });

app.addHook('onRequest', async (request, reply) => {
  if (!API_KEY) return;
  if (request.url === '/health' || request.url.startsWith('/docs')) return;
  const header = request.headers['x-api-key'] ?? '';
  const bearer = (request.headers.authorization ?? '').replace(/^Bearer /, '');
  if (header !== API_KEY && bearer !== API_KEY) {
    return reply.code(401).send({ error: 'chave de API ausente ou inválida' });
  }
});

const carimbo = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');

/**
 * Uma extração em andamento é reaproveitada por requisições concorrentes: sem
 * isso, dois cliques no botão baixariam as cinco tabelas duas vezes.
 */
let emAndamento = null;

async function extrair(ttl) {
  if (!emAndamento) {
    emAndamento = carregarDados(client, { ttl })
      .then(gerarLinhas)
      .finally(() => {
        emAndamento = null;
      });
  }
  return emAndamento;
}

// ---------------------------------------------------------------- extração

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
          osp: { type: 'string', description: 'Número da OSP ou o unique id dela. * (ou vazio) traz todos' },
          sep: { type: 'string', minLength: 1, maxLength: 1, default: ',', description: 'Separador do CSV; use ; para Excel brasileiro' },
          bom: { type: 'boolean', default: true, description: 'BOM UTF-8, para o Excel ler os acentos' },
          linhas: { type: 'integer', minimum: 1, default: 1500, description: 'Máximo de linhas por arquivo no zip' },
          ttl: { type: 'integer', minimum: 0, description: 'Validade do cache em segundos; 0 busca dado fresco' },
        },
      },
    },
  },
  async (request, reply) => {
    const {
      formato, sep, bom, linhas: maxLinhas, ttl,
      fornecedor, fornecedor_id: fornecedorId, status, osp, osp_id: ospId,
    } = request.query;
    const linhas = filtrar(await extrair(ttl ?? CACHE_TTL), {
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
        .header('Content-Disposition', `attachment; filename="extracao_osp-${carimbo()}.zip"`)
        .header('X-File-Count', String(arquivos.length))
        .send(await zipArquivos(arquivos));
    }

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="extracao_osp-${carimbo()}.csv"`)
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

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`documentação em http://localhost:${PORT}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
