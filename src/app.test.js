import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { criarApp } from './app.js';
import { clientFalso } from './dados-falsos.js';

/** App com a fonte de dados falsa e sem cache, para nada tocar disco nem rede. */
const app = ({ apiKey } = {}) =>
  criarApp({ apiKey, cacheTtl: 0, logger: false, clientDe: () => clientFalso() });

describe('montar o app', () => {
  it('não escuta em porta nenhuma', async () => {
    const instancia = await app();
    await instancia.ready();
    assert.equal(instancia.server.listening, false);
    await instancia.close();
  });
});

describe('/health', () => {
  it('responde 200 sem chave de API, mesmo com a chave ligada', async () => {
    const instancia = await app({ apiKey: 'segredo' });
    const res = await instancia.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'ok' });
    await instancia.close();
  });
});

describe('/docs', () => {
  it('segue aberto sem chave', async () => {
    const instancia = await app({ apiKey: 'segredo' });
    const res = await instancia.inject({ method: 'GET', url: '/docs/' });
    assert.equal(res.statusCode, 200);
    await instancia.close();
  });
});

describe('chave de API', () => {
  it('recusa 401 quem não apresenta a chave', async () => {
    const instancia = await app({ apiKey: 'segredo' });
    const res = await instancia.inject({ method: 'GET', url: '/extracao?formato=json&ttl=0' });
    assert.equal(res.statusCode, 401);
    assert.match(res.json().error, /chave de API/);
    await instancia.close();
  });

  it('recusa 401 com a chave errada', async () => {
    const instancia = await app({ apiKey: 'segredo' });
    const res = await instancia.inject({
      method: 'GET',
      url: '/extracao?formato=json&ttl=0',
      headers: { 'x-api-key': 'outra' },
    });
    assert.equal(res.statusCode, 401);
    await instancia.close();
  });

  it('aceita a chave no header X-API-Key', async () => {
    const instancia = await app({ apiKey: 'segredo' });
    const res = await instancia.inject({
      method: 'GET',
      url: '/extracao?formato=json&ttl=0',
      headers: { 'x-api-key': 'segredo' },
    });
    assert.equal(res.statusCode, 200);
    await instancia.close();
  });

  it('aceita a chave no Authorization: Bearer', async () => {
    const instancia = await app({ apiKey: 'segredo' });
    const res = await instancia.inject({
      method: 'GET',
      url: '/extracao?formato=json&ttl=0',
      headers: { authorization: 'Bearer segredo' },
    });
    assert.equal(res.statusCode, 200);
    await instancia.close();
  });

  it('desligada no ambiente, nenhuma rota exige chave', async () => {
    const instancia = await app({ apiKey: undefined });
    const res = await instancia.inject({ method: 'GET', url: '/extracao?formato=json&ttl=0' });
    assert.equal(res.statusCode, 200);
    await instancia.close();
  });
});

describe('entrypoint', () => {
  let servidor;
  after(() => servidor?.kill('SIGKILL'));

  it('sobe o servidor e loga a documentação', async () => {
    const porta = 38221;
    servidor = spawn(process.execPath, ['src/server.js'], {
      env: {
        ...process.env,
        PORT: String(porta),
        BUBBLE_BASE_URL: 'https://exemplo.bubbleapps.io/api/1.1/obj',
        BUBBLE_TOKEN: 'token-falso',
        API_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let saida = '';
    const subiu = new Promise((resolve, reject) => {
      servidor.stdout.on('data', (pedaco) => {
        saida += pedaco;
        if (saida.includes('/docs')) resolve();
      });
      servidor.stderr.on('data', (pedaco) => { saida += pedaco; });
      once(servidor, 'exit').then(() => reject(new Error(`servidor saiu: ${saida}`)));
      setTimeout(() => reject(new Error(`servidor não subiu: ${saida}`)), 15_000).unref();
    });
    await subiu;

    assert.match(saida, new RegExp(`documentação em http://localhost:${porta}/docs`));
    const res = await fetch(`http://localhost:${porta}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});
