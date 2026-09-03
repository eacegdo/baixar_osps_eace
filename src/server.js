// Entrypoint da API: monta o app e escuta na porta. Toda a superfície HTTP
// vive no `app.js`, que não abre porta nenhuma.
import { criarApp, clientsPorVersao } from './app.js';

const PORT = Number(process.env.PORT ?? 8080);

const clientDe = clientsPorVersao();
// A live sobe junto com o servidor: é ela que valida as variáveis de ambiente
// no boot, em vez de o erro só aparecer na primeira requisição.
clientDe('live');

const app = await criarApp({ clientDe });

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`documentação em http://localhost:${PORT}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
