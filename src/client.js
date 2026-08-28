import { BubbleClient } from './bubble.js';

/** Cliente único, com as credenciais do ambiente e limite global de requisições. */
export function criarClient() {
  const { BUBBLE_BASE_URL, BUBBLE_TOKEN, BUBBLE_CONCURRENCY } = process.env;
  if (!BUBBLE_BASE_URL || !BUBBLE_TOKEN) {
    console.error('BUBBLE_BASE_URL e BUBBLE_TOKEN são obrigatórios (use --env-file=.env)');
    process.exit(1);
  }
  return new BubbleClient(BUBBLE_BASE_URL, BUBBLE_TOKEN, {
    concurrency: Number(BUBBLE_CONCURRENCY ?? 16),
  });
}
