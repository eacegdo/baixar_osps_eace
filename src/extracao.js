#!/usr/bin/env node
// CLI da Extração completa OSP.
//   node --env-file=.env src/extracao.js [--out extracao_osp] [--linhas 1500]
//                                        [--zip] [--unico arquivo.csv] [--sep ';']
//                                        [--fornecedor BRISANET] [--fornecedor-id 17746x1528]
//                                        [--osp 254] [--osp-id 17825x2065] [--status Concluído]
//                                        [--ttl 900] [--sem-cache] [--atualizar]
//                                        [--versao live|test]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { criarClient } from './client.js';
import { extrair } from './extracao-core.js';

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

const versao = args.versao === true ? 'live' : (args.versao ?? 'live');

const client = criarClient(versao);
const inicio = Date.now();

console.log(`Baixando tabelas (${versao})...`);
const extracao = await extrair(client, {
  ttl,
  // --atualizar baixa do Bubble e regrava o cache; --sem-cache passa por fora dele.
  atualizar: Boolean(args.atualizar),
  onTabela: ({ tabela, registros, ms, doCache }) =>
    console.log(`  ${tabela}: ${registros} registros (${(ms / 1000).toFixed(1)}s${doCache ? ', cache' : ''})`),
  fornecedor: args.fornecedor,
  fornecedorId: args['fornecedor-id'],
  status: args.status,
  numOsp: args.osp,
  ospId: args['osp-id'],
  sep,
  // O arquivo único vai para o Excel: leva BOM. Os do zip seguem sem, como no modelo.
  bom: true,
  maxLinhas,
});
const { linhas } = extracao;
const segundos = () => ((Date.now() - inicio) / 1000).toFixed(1);

if (args.unico) {
  const arquivo = args.unico === true ? 'extracao_osp.csv' : args.unico;
  await pipeline(Readable.from(extracao.csvChunks()), createWriteStream(arquivo));
  console.log(`OK: ${linhas.length} linhas -> ${arquivo} (${segundos()}s)`);
} else {
  const arquivos = extracao.arquivos();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await Promise.all(arquivos.map((a) => writeFile(path.join(outDir, a.nome), a.conteudo)));

  if (args.zip) {
    const destino = `${outDir}.zip`;
    await writeFile(destino, await extracao.zip());
    console.log(`zip: ${destino}`);
  }

  const fornecedores = new Set(linhas.map((l) => l.Fornecedor || 'SEM_FORNECEDOR'));
  console.log(
    `OK: ${linhas.length} linhas, ${fornecedores.size} fornecedores, ${arquivos.length} arquivos em ${outDir}/ (${segundos()}s)`,
  );
}
