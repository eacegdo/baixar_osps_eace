// Rota de extração de ponta a ponta, por injeção de requisição: tabelas falsas
// entram e csv, zip e json saem. É a rede de segurança dos refactors.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { criarApp } from './app.js';
import { COLUNAS } from './extracao-core.js';
import { clientFalso, tabelasFalsas, FORN_NUH, OSP_PROV } from './dados-falsos.js';

const BOM = '﻿';

/** App com a fonte de dados falsa e sem cache, para nada tocar disco nem rede. */
const app = ({ tabelas } = {}) =>
  criarApp({
    apiKey: undefined,
    cacheTtl: 0,
    logger: false,
    clientDe: (versao) => clientFalso({ versao, tabelas: tabelas ?? tabelasFalsas() }),
  });

const pedir = async (querystring, opcoes) => {
  const instancia = await app(opcoes);
  try {
    return await instancia.inject({ method: 'GET', url: `/extracao?${querystring}` });
  } finally {
    await instancia.close();
  }
};

/** Linhas de dados do CSV, sem o cabeçalho e sem a linha vazia do fim. */
const corpoCsv = (texto, sep = ',') => {
  const [cabecalho, ...resto] = texto.replace(BOM, '').split('\r\n');
  return { cabecalho: cabecalho.split(sep), linhas: resto.filter((l) => l !== '') };
};

describe('formato csv', () => {
  it('devolve o cabeçalho do relatório e uma linha por item de OSP', async () => {
    const res = await pedir('formato=csv&ttl=0');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');

    const { cabecalho, linhas } = corpoCsv(res.body);
    assert.deepEqual(cabecalho, COLUNAS);
    // Três FRs com um item cada, mais a FR sem item, que vira uma linha só.
    assert.equal(linhas.length, 4);
    assert.equal(res.headers['x-row-count'], '4');
  });

  it('respeita o separador pedido', async () => {
    const res = await pedir('formato=csv&sep=%3B&ttl=0');
    const { cabecalho, linhas } = corpoCsv(res.body, ';');
    assert.deepEqual(cabecalho, COLUNAS);
    assert.equal(linhas.length, 4);
  });

  it('põe BOM por padrão e omite quando bom=false', async () => {
    const comBom = await pedir('formato=csv&ttl=0');
    assert.ok(comBom.body.startsWith(BOM));

    const semBom = await pedir('formato=csv&bom=false&ttl=0');
    assert.ok(!semBom.body.startsWith(BOM));
    assert.ok(semBom.body.startsWith('Projeto'));
  });

  it('escapa vírgula, aspas e quebra de linha dentro da célula', async () => {
    const res = await pedir('formato=csv&fornecedor=BRISANET&ttl=0');
    const { linhas } = corpoCsv(res.body);
    // A quebra de linha vira espaço e a célula sai entre aspas, com aspas dobradas.
    const comEscape = linhas.find((l) => l.includes('Fibra'));
    assert.ok(comEscape.includes('"Fibra, 100m com emenda ""dupla"""'), comEscape);
    // Nenhuma linha extra: a quebra de dentro da célula não partiu o arquivo.
    assert.equal(linhas.length, 2);
  });
});

describe('formato zip', () => {
  const arquivosDoZip = (res) => unzipSync(new Uint8Array(res.rawPayload));

  it('devolve um arquivo por fornecedor', async () => {
    const res = await pedir('formato=zip&ttl=0');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/zip');
    assert.equal(res.headers['x-file-count'], '2');

    const arquivos = arquivosDoZip(res);
    assert.deepEqual(Object.keys(arquivos).sort(), ['BRISANET_Parte_1.csv', 'NUH__DIGITAL_Parte_1.csv']);

    const { cabecalho, linhas } = corpoCsv(strFromU8(arquivos['NUH__DIGITAL_Parte_1.csv']));
    assert.deepEqual(cabecalho, COLUNAS);
    assert.equal(linhas.length, 2);
  });

  it('respeita o máximo de linhas por arquivo, sem cortar uma OSP ao meio', async () => {
    const res = await pedir('formato=zip&linhas=1&ttl=0');
    const arquivos = arquivosDoZip(res);
    assert.deepEqual(Object.keys(arquivos).sort(), [
      // As duas linhas da BRISANET são da mesma OSP: não se separam.
      'BRISANET_Parte_1.csv',
      'NUH__DIGITAL_Parte_1.csv',
      'NUH__DIGITAL_Parte_2.csv',
    ]);
    assert.equal(res.headers['x-file-count'], '3');
  });
});

describe('formato json', () => {
  it('devolve a contagem de linhas, as colunas e os dados', async () => {
    const res = await pedir('formato=json&ttl=0');
    assert.equal(res.statusCode, 200);
    const corpo = res.json();
    assert.equal(corpo.linhas, 4);
    assert.deepEqual(corpo.colunas, COLUNAS);
    assert.equal(corpo.dados.length, 4);
    for (const coluna of COLUNAS) assert.ok(coluna in corpo.dados[0], `falta ${coluna}`);
  });
});

describe('filtros', () => {
  const quantas = async (querystring) => (await pedir(`formato=json&ttl=0&${querystring}`)).json().linhas;

  it('fornecedor por nome, por unique id e * para todos', async () => {
    assert.equal(await quantas('fornecedor=NUH! DIGITAL'), 2);
    assert.equal(await quantas(`fornecedor=${FORN_NUH}`), 2);
    assert.equal(await quantas(`fornecedor_id=${FORN_NUH}`), 2);
    assert.equal(await quantas('fornecedor=*'), 4);
    assert.equal(await quantas('fornecedor='), 4);
  });

  it('status da OSP', async () => {
    assert.equal(await quantas('status=Concluído'), 2);
    assert.equal(await quantas('status=Solicitado'), 1);
    assert.equal(await quantas('status=*'), 4);
  });

  it('osp por número definitivo, provisório e unique id', async () => {
    assert.equal(await quantas('osp=4782'), 1);
    assert.equal(await quantas('osp=5303'), 1);
    assert.equal(await quantas(`osp=${OSP_PROV}`), 1);
    assert.equal(await quantas(`osp_id=${OSP_PROV}`), 1);
  });

  it('combina fornecedor e status', async () => {
    assert.equal(await quantas('fornecedor=NUH! DIGITAL&status=Solicitado'), 1);
    assert.equal(await quantas('fornecedor=BRISANET&status=Solicitado'), 0);
  });
});

describe('nome do arquivo baixado', () => {
  const nome = (res) => res.headers['content-disposition'];

  it('segue o padrão extracao_osp-<carimbo>', async () => {
    const res = await pedir('formato=csv&ttl=0');
    assert.match(nome(res), /^attachment; filename="extracao_osp-\d{8}T\d{6}\.csv"$/);
  });

  it('marca a versão test no nome', async () => {
    const res = await pedir('formato=csv&versao=test&ttl=0');
    assert.match(nome(res), /^attachment; filename="extracao_osp-test-\d{8}T\d{6}\.csv"$/);
  });

  it('respeita o nome pedido e tira a extensão repetida', async () => {
    const res = await pedir('formato=csv&arquivo=relatorio_marco.csv&ttl=0');
    assert.equal(nome(res), 'attachment; filename="relatorio_marco.csv"');
  });

  it('não escapa das aspas do cabeçalho', async () => {
    const res = await pedir(`formato=zip&arquivo=${encodeURIComponent('mau"; rm -rf /')}&ttl=0`);
    assert.equal(nome(res), 'attachment; filename="mau___rm__rf__.zip"');
  });
});

describe('cabeçalhos de resposta', () => {
  it('contagem de linhas, contagem de arquivos e versão do Bubble', async () => {
    const csv = await pedir('formato=csv&ttl=0');
    assert.equal(csv.headers['x-row-count'], '4');
    assert.equal(csv.headers['x-bubble-version'], 'live');

    const zip = await pedir('formato=zip&versao=test&ttl=0');
    assert.equal(zip.headers['x-row-count'], '4');
    assert.equal(zip.headers['x-file-count'], '2');
    assert.equal(zip.headers['x-bubble-version'], 'test');
  });
});

describe('validação da querystring', () => {
  it('formato desconhecido responde 400', async () => {
    const res = await pedir('formato=xlsx&ttl=0');
    assert.equal(res.statusCode, 400);
  });
});
