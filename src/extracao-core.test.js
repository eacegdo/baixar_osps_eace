import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gerarLinhas, filtrar, idsDe } from './extracao-core.js';

const fornId = '100x1';
const ospProvId = '200x1';
const ospAprovId = '200x2';
const frProvId = '300x1';
const frAprovId = '300x2';
const itemProvId = '400x1';
const itemAprovId = '400x2';

const fornecedor = {
  _id: fornId,
  'Nome Fantasia': 'NUH! DIGITAL',
  CNPJ: '29.556.286/0001-78',
  cod_aniel: '136',
};

const dadosBase = () => ({
  fornecedor: [fornecedor],
  Escolas: [],
  contrato_taxa_instalacao: [
    {
      _id: itemProvId,
      Descrição: 'Kit provisório',
      Quantidade: 1,
      'Valor Unitário': 100,
      'Valor Total': 100,
      'produto/serviço': 'Material',
      Fornecedor: fornId,
      'Num Provisório': 5303,
    },
    {
      _id: itemAprovId,
      Descrição: 'Kit aprovado',
      Quantidade: 1,
      'Valor Unitário': 200,
      'Valor Total': 200,
      'produto/serviço': 'Material',
      Fornecedor: fornId,
      'Num OSP': 4782,
      'Num Provisório': 5303,
    },
  ],
  OSP: [
    {
      _id: ospProvId,
      Fornecedor: fornId,
      status: 'Solicitado',
      num_prov: 5303,
      // Sem OSnum e sem lista FR — vínculo só em FR.OSP
    },
    {
      _id: ospAprovId,
      Fornecedor: fornId,
      status: 'Nota Fiscal',
      OSnum: 4782,
      num_prov: 5304,
      FR: [frAprovId],
    },
    {
      _id: '200x3',
      Fornecedor: fornId,
      status: 'Nota Fiscal',
      OSnum: 1793,
      num_prov: 1603,
      // Sem FR — não deve gerar linha
    },
  ],
  FR_OSP: [
    {
      _id: frProvId,
      OSP: ospProvId,
      status: 'Pendente',
      'lista de contratos_instalação': [itemProvId],
      'Valor da nota': 100,
    },
    {
      _id: frAprovId,
      OSP: ospAprovId,
      status: 'Pendente',
      'lista de contratos_instalação': [itemAprovId],
      'Valor da nota': 200,
    },
  ],
});

describe('gerarLinhas — FRs provisórias', () => {
  it('FR ligada só por FR.OSP, OSP sem OSnum → Provisório com num_prov e fornecedor', () => {
    const linhas = gerarLinhas(dadosBase()).filter((l) => l['ID Sisop'] === frProvId);
    assert.equal(linhas.length, 1);
    const l = linhas[0];
    assert.equal(l['Num OSP'], '');
    assert.equal(l['Num provisorio'], 5303);
    assert.equal(l['Validação OSP'], 'Provisório');
    assert.equal(l['Status OSP'], 'Solicitado');
    assert.equal(l.Fornecedor, 'NUH! DIGITAL');
    assert.equal(l._ospId, ospProvId);
    assert.equal(l['Descrição Item'], 'Kit provisório');
  });

  it('FR ligada por OSP.FR com OSnum → Aprovado e Num OSP preenchido', () => {
    const linhas = gerarLinhas(dadosBase()).filter((l) => l['ID Sisop'] === frAprovId);
    assert.equal(linhas.length, 1);
    const l = linhas[0];
    assert.equal(l['Num OSP'], 4782);
    assert.equal(l['Num provisorio'], 5304);
    assert.equal(l['Validação OSP'], 'Aprovado');
    assert.equal(l['Status OSP'], 'Nota Fiscal');
    assert.equal(l.Fornecedor, 'NUH! DIGITAL');
  });

  it('OSP sem nenhuma FR → zero linhas (não inventa FR)', () => {
    const linhas = gerarLinhas(dadosBase()).filter((l) => l['Num OSP'] === 1793 || l._ospId === '200x3');
    assert.equal(linhas.length, 0);
  });
});

describe('filtrar — número definitivo ou provisório', () => {
  it('filtrar por Num provisorio encontra FR provisória', () => {
    const linhas = gerarLinhas(dadosBase());
    const achadas = filtrar(linhas, { numOsp: 5303 });
    assert.equal(achadas.length, 1);
    assert.equal(achadas[0]['ID Sisop'], frProvId);
    assert.equal(achadas[0]['Validação OSP'], 'Provisório');
  });

  it('filtrar por Num OSP encontra FR aprovada', () => {
    const linhas = gerarLinhas(dadosBase());
    const achadas = filtrar(linhas, { numOsp: 4782 });
    assert.equal(achadas.length, 1);
    assert.equal(achadas[0]['ID Sisop'], frAprovId);
  });
});

describe('Valor da NF', () => {
  it("usa o 'Valor Total' do item, como a tela do SISOP", () => {
    const l = gerarLinhas(dadosBase()).find((x) => x['ID Sisop'] === frAprovId);
    assert.equal(l['Valor da NF'], '200,00');
  });

  it("ignora os campos de valor da própria FR", () => {
    const dados = dadosBase();
    dados.FR_OSP[0]['Valor da nota'] = 99999;
    dados.FR_OSP[0]['Valor total'] = 88888;
    const l = gerarLinhas(dados).find((x) => x['ID Sisop'] === frProvId);
    assert.equal(l['Valor da NF'], '100,00');
  });

  it('mesmo número de Valor Produto, com separador de milhar', () => {
    const dados = dadosBase();
    dados.contrato_taxa_instalacao[0]['Valor Total'] = 14579.25;
    const l = gerarLinhas(dados).find((x) => x['ID Sisop'] === frProvId);
    assert.equal(l['Valor Produto'], '14579,25');
    assert.equal(l['Valor da NF'], '14.579,25');
  });

  it('FR sem item fica vazia', () => {
    const dados = dadosBase();
    dados.FR_OSP[0]['lista de contratos_instalação'] = [];
    const l = gerarLinhas(dados).find((x) => x['ID Sisop'] === frProvId);
    assert.equal(l['Valor da NF'], '');
  });
});

describe('índice de ids', () => {
  it('os filtros por id não dependem dos campos da linha', () => {
    const linhas = gerarLinhas(dadosBase());
    // Apaga os campos de compatibilidade: quem filtra é o índice interno.
    for (const l of linhas) {
      delete l._fornecedorId;
      delete l._ospId;
      delete l._escolaId;
    }
    assert.equal(filtrar(linhas, { ospId: ospProvId }).length, 1);
    assert.equal(filtrar(linhas, { fornecedorId: fornId }).length, 2);
    assert.equal(filtrar(linhas, { fornecedor: fornId }).length, 2);
    assert.equal(filtrar(linhas, { numOsp: ospProvId }).length, 1);
  });

  it('expõe os ids de cada linha sem eles atravessarem a linha', () => {
    const linha = gerarLinhas(dadosBase()).find((l) => l['ID Sisop'] === frProvId);
    assert.deepEqual(idsDe(linha), { fornecedorId: fornId, ospId: ospProvId, escolaId: '' });
  });
});
