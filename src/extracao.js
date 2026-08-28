#!/usr/bin/env node
// CLI da Extração completa OSP.
//   node --env-file=.env src/extracao.js [--out extracao_osp] [--linhas 1500]
//                                        [--zip] [--unico arquivo.csv] [--sep ';']
//                                        [--fornecedor BRISANET] [--fornecedor-id 17746x1528]
//                                        [--osp 254] [--osp-id 17825x2065] [--status Concluído]
//                                        [--ttl 900] [--sem-cache]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { criarClient } from './client.js';
import { carregarDados, gerarLinhas, filtrar, particionar, csvChunks, csvCompleto } from './extracao-core.js';
import { zipArquivos } from './zip.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const chave = argv[i].slice(2);
    const proximo = argv[i + 1];
    args[chave] = !proximo || proximo.startsWith('--') ? true : proximo;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const outDir = args.out ?? 'extracao_osp';
const maxLinhas = Number(args.linhas ?? 1500);
const sep = args.sep ?? ',';
const ttl = args['sem-cache'] ? 0 : Number(args.ttl ?? process.env.CACHE_TTL ?? 900);

const client = criarClient();
const inicio = Date.now();

console.log('Baixando tabelas...');
const dados = await carregarDados(client, {
  ttl,
  onTabela: ({ tabela, registros, ms, doCache }) =>
    console.log(`  ${tabela}: ${registros} registros (${(ms / 1000).toFixed(1)}s${doCache ? ', cache' : ''})`),
});

let linhas = gerarLinhas(dados);
linhas = filtrar(linhas, {
  fornecedor: args.fornecedor,
  fornecedorId: args['fornecedor-id'],
  status: args.status,
  numOsp: args.osp,
  ospId: args['osp-id'],
});

if (args.unico) {
  const arquivo = args.unico === true ? 'extracao_osp.csv' : args.unico;
  await pipeline(Readable.from(csvChunks(linhas, sep, true)), createWriteStream(arquivo));
  console.log(`OK: ${linhas.length} linhas -> ${arquivo} (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
} else {
  const arquivos = particionar(linhas, maxLinhas);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await Promise.all(
    arquivos.map((a) => writeFile(path.join(outDir, a.nome), csvCompleto(a.linhas, sep))),
  );

  if (args.zip) {
    const destino = `${outDir}.zip`;
    const conteudos = arquivos.map((a) => ({ nome: a.nome, conteudo: csvCompleto(a.linhas, sep) }));
    await writeFile(destino, await zipArquivos(conteudos));
    console.log(`zip: ${destino}`);
  }

  const fornecedores = new Set(linhas.map((l) => l.Fornecedor || 'SEM_FORNECEDOR'));
  console.log(
    `OK: ${linhas.length} linhas, ${fornecedores.size} fornecedores, ${arquivos.length} arquivos em ${outDir}/ (${((Date.now() - inicio) / 1000).toFixed(1)}s)`,
  );
}
