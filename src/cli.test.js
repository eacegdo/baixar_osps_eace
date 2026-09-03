// CLI de ponta a ponta: um Bubble falso em HTTP, o CLI rodando num diretório
// temporário, e os arquivos que ele escreveu no disco.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { tabelasFalsas } from './dados-falsos.js';

const executar = promisify(execFile);
const CLI = path.join(import.meta.dirname, 'extracao.js');

describe('CLI', () => {
  let servidor;
  let baseUrl;
  let dir;

  before(async () => {
    const tabelas = tabelasFalsas();
    // Mesma forma da Data API do Bubble: { response: { results, remaining } }.
    servidor = createServer((req, res) => {
      const tabela = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\//, ''));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ response: { results: tabelas[tabela] ?? [], remaining: 0 } }));
    });
    await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${servidor.address().port}`;
    dir = await mkdtemp(path.join(tmpdir(), 'cli-osp-'));
  });

  after(async () => {
    servidor?.close();
    await rm(dir, { recursive: true, force: true });
  });

  /** Roda o CLI no diretório temporário, sem cache em disco. */
  const rodar = (...argumentos) =>
    executar(process.execPath, [CLI, '--sem-cache', ...argumentos], {
      cwd: dir,
      env: {
        ...process.env,
        BUBBLE_BASE_URL: baseUrl,
        BUBBLE_TOKEN: 'token-falso',
        CACHE_DIR: path.join(dir, '.cache'),
      },
    });

  it('escreve um arquivo por fornecedor e relata o progresso por tabela', async () => {
    const { stdout } = await rodar('--out', 'saida');

    for (const tabela of ['FR_OSP', 'contrato_taxa_instalacao', 'OSP', 'Escolas', 'fornecedor']) {
      assert.match(stdout, new RegExp(`  ${tabela}: \\d+ registros`), stdout);
    }
    assert.match(stdout, /OK: 4 linhas, 2 fornecedores, 2 arquivos em saida\//);

    const escritos = await readdir(path.join(dir, 'saida'));
    assert.deepEqual(escritos.sort(), ['BRISANET_Parte_1.csv', 'NUH__DIGITAL_Parte_1.csv']);

    const csv = await readFile(path.join(dir, 'saida', 'NUH__DIGITAL_Parte_1.csv'), 'utf8');
    assert.ok(csv.startsWith('Projeto,Cod Fornecedor,'), csv.slice(0, 40));
    // Cabeçalho e duas linhas; os arquivos do zip vão sem BOM, como no modelo.
    assert.equal(csv.trimEnd().split('\r\n').length, 3);
    assert.ok(!csv.startsWith('﻿'));
  });

  it('--unico escreve um CSV só, com BOM para o Excel', async () => {
    const { stdout } = await rodar('--unico', 'tudo.csv');
    assert.match(stdout, /OK: 4 linhas -> tudo\.csv/);

    const csv = await readFile(path.join(dir, 'tudo.csv'), 'utf8');
    assert.ok(csv.startsWith('﻿Projeto,'));
    assert.equal(csv.trimEnd().split('\r\n').length, 5);
  });

  it('--zip empacota os arquivos por fornecedor', async () => {
    const { stdout } = await rodar('--out', 'comzip', '--zip');
    assert.match(stdout, /zip: comzip\.zip/);

    const bytes = await readFile(path.join(dir, 'comzip.zip'));
    assert.deepEqual(
      Object.keys(unzipSync(new Uint8Array(bytes))).sort(),
      ['BRISANET_Parte_1.csv', 'NUH__DIGITAL_Parte_1.csv'],
    );
  });

  it('os filtros e o separador da linha de comando recortam o resultado', async () => {
    const { stdout } = await rodar('--out', 'recorte', '--fornecedor', 'BRISANET', '--sep', ';');
    assert.match(stdout, /OK: 2 linhas, 1 fornecedores, 1 arquivos/);

    const csv = await readFile(path.join(dir, 'recorte', 'BRISANET_Parte_1.csv'), 'utf8');
    assert.ok(csv.startsWith('Projeto;Cod Fornecedor;'), csv.slice(0, 40));
  });

  it('--linhas fatia sem cortar uma OSP ao meio', async () => {
    await rodar('--out', 'fatiado', '--linhas', '1');
    const escritos = await readdir(path.join(dir, 'fatiado'));
    assert.deepEqual(escritos.sort(), [
      // As duas linhas da BRISANET são da mesma OSP: não se separam.
      'BRISANET_Parte_1.csv',
      'NUH__DIGITAL_Parte_1.csv',
      'NUH__DIGITAL_Parte_2.csv',
    ]);
  });
});
