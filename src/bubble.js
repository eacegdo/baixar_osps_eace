import { Pool } from './pool.js';

const MAX_PAGE_SIZE = 100; // hard cap imposed by the Bubble Data API
const DEFAULT_CONCURRENCY = 16; // medido: acima disso o Bubble não responde mais rápido

export class BubbleClient {
  /**
   * @param {string} baseUrl root of the Data API, e.g.
   *   https://myapp.bubbleapps.io/api/1.1/obj (or /version-test/api/1.1/obj)
   * @param {string} token Bubble API token
   */
  constructor(baseUrl, token, { timeoutMs = 60_000, concurrency = DEFAULT_CONCURRENCY, pool } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.concurrency = concurrency;
    // Compartilhado entre todas as tabelas baixadas por este cliente.
    this.pool = pool ?? new Pool(concurrency);
  }

  async fetchPage(table, { constraints, sortField, descending } = {}, cursor = 0, limit = MAX_PAGE_SIZE) {
    const params = new URLSearchParams({ cursor: String(cursor), limit: String(limit) });
    if (constraints) params.set('constraints', constraints);
    if (sortField) {
      params.set('sort_field', sortField);
      params.set('descending', String(Boolean(descending)));
    }

    const url = `${this.baseUrl}/${encodeURIComponent(table)}?${params}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 2048).trim();
      const err = new Error(`bubble returned ${res.status}: ${body}`);
      err.statusCode = res.status;
      throw err;
    }

    const { response } = await res.json();
    return {
      results: response?.results ?? [],
      remaining: response?.remaining ?? 0,
    };
  }

  /**
   * Pages through the whole table, yielding one page of records at a time.
   * Stops when Bubble reports nothing remaining or returns an empty page.
   */
  async *pages(table, options = {}) {
    const limit = Math.min(options.pageSize || MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    let cursor = 0;

    for (;;) {
      const { results, remaining } = await this.fetchPage(table, options, cursor, limit);
      if (results.length > 0) yield results;
      if (remaining <= 0 || results.length === 0) return;
      cursor += results.length;
    }
  }

  /**
   * Fetches the whole table. The first page reports how many records remain,
   * so the rest of the cursors are known upfront and can be fetched in
   * parallel — a 40k-row table is ~400 sequential round trips otherwise.
   *
   * @param {(fetched: number, total: number) => void} [onProgress]
   */
  async fetchAll(table, options = {}, onProgress) {
    const limit = Math.min(options.pageSize || MAX_PAGE_SIZE, MAX_PAGE_SIZE);
    const first = await this.fetchPage(table, options, 0, limit);

    let total = first.results.length + first.remaining;
    if (options.maxRows) total = Math.min(total, options.maxRows);

    const records = first.results.slice(0, total);
    onProgress?.(records.length, total);
    if (records.length >= total || first.results.length === 0) return records.slice(0, total);

    // Pre-size the buffer so pages can land out of order and still be in order.
    const cursors = [];
    for (let c = first.results.length; c < total; c += limit) cursors.push(c);
    const pages = new Array(cursors.length);

    let fetched = records.length;
    await Promise.all(
      cursors.map((cursor, i) =>
        this.pool.run(async () => {
          const page = await this.fetchPage(table, options, cursor, limit);
          pages[i] = page.results;
          fetched += page.results.length;
          onProgress?.(fetched, total);
        }),
      ),
    );

    for (const page of pages) {
      if (page) records.push(...page);
    }
    return records.slice(0, total);
  }
}
