import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  intervaloDoMes,
  agruparEscolasConectadas,
  buscarImportacaoEscola,
  buscarEscolasPorIneps,
  obterEscolasConectadasNoMes,
  carregarDadosMes,
} from './competencia.js';

describe('competencia.js — intervaloDoMes', () => {
  it('calcula o intervalo para um mês específico YYYY-MM', () => {
    const res = intervaloDoMes('2026-09');
    assert.equal(res.inicio, '2026-09-01T00:00:00.000Z');
    assert.equal(res.fim, '2026-10-01T00:00:00.000Z');
    assert.equal(res.ano, 2026);
    assert.equal(res.mes, 9);
    assert.equal(res.rotulo, '2026-09');
  });

  it('vira o ano ao calcular o mês 12', () => {
    const res = intervaloDoMes('2025-12');
    assert.equal(res.inicio, '2025-12-01T00:00:00.000Z');
    assert.equal(res.fim, '2026-01-01T00:00:00.000Z');
    assert.equal(res.ano, 2025);
    assert.equal(res.mes, 12);
  });

  it('calcula o mês atual a partir de uma data fixa', () => {
    const dataRef = new Date('2026-04-15T10:00:00Z');
    const res = intervaloDoMes('atual', dataRef);
    assert.equal(res.inicio, '2026-04-01T00:00:00.000Z');
    assert.equal(res.fim, '2026-05-01T00:00:00.000Z');
    assert.equal(res.rotulo, '2026-04');
  });

  it('rejeita formato inválido', () => {
    assert.throws(() => intervaloDoMes('2026-13'), /mês fora do intervalo/);
    assert.throws(() => intervaloDoMes('invalido'), /formato de mês inválido/);
    assert.throws(() => intervaloDoMes('2026-00'), /mês fora do intervalo/);
  });
});

describe('competencia.js — agruparEscolasConectadas', () => {
  const escolas = [
    { _id: 'esc-1', INEP: '1001', 'Status Geral': 'Conectada', 'NOME ESCOLA': 'Escola 1' },
    { _id: 'esc-2', INEP: '1002', 'Status Geral': 'Em implantação', 'NOME ESCOLA': 'Escola 2' },
    { _id: 'esc-3', INEP: '1003', 'Status Geral': 'Conectada', 'NOME ESCOLA': 'Escola 3' },
  ];

  it('agrupa por inep, elege a data mais recente e filtra por Status Geral = Conectada', () => {
    const importacoes = [
      { _id: 'imp-1', inep: '1001', data_relatorio: '2026-09-02T10:00:00Z' },
      { _id: 'imp-2', inep: '1001', data_relatorio: '2026-09-10T14:00:00Z' }, // mais recente
      { _id: 'imp-3', inep: '1001', data_relatorio: '2026-09-05T08:00:00Z' },
      { _id: 'imp-4', inep: '1002', data_relatorio: '2026-09-03T12:00:00Z' }, // não conectada
      { _id: 'imp-5', inep: '1003', data_relatorio: '2026-09-01T00:00:00Z' }, // conectada
      { _id: 'imp-6', inep: '9999', data_relatorio: '2026-09-01T00:00:00Z' }, // inep inexistente em escolas
    ];

    const { porInep, porEscolaId, escolas: resultado } = agruparEscolasConectadas(importacoes, escolas);

    assert.equal(resultado.length, 2);
    assert.equal(porInep.size, 2);
    assert.equal(porEscolaId.size, 2);

    // Escola 1001 deve pegar a data mais recente (2026-09-10)
    const esc1 = porInep.get('1001');
    assert.ok(esc1);
    assert.equal(esc1.escolaId, 'esc-1');
    assert.equal(esc1.dataRelatorio, '2026-09-10T14:00:00Z');
    assert.equal(porEscolaId.get('esc-1'), esc1);

    // Escola 1002 deve ser ignorada pois não está Conectada
    assert.equal(porInep.has('1002'), false);

    // Escola 1003 está presente
    const esc3 = porInep.get('1003');
    assert.ok(esc3);
    assert.equal(esc3.escolaId, 'esc-3');
    assert.equal(esc3.dataRelatorio, '2026-09-01T00:00:00Z');

    // Inep 9999 ignorado
    assert.equal(porInep.has('9999'), false);
  });

  it('ignora registros com inep vazio ou data_relatorio nula', () => {
    const importacoes = [
      { _id: 'imp-1', inep: '', data_relatorio: '2026-09-01T00:00:00Z' },
      { _id: 'imp-2', inep: '1001', data_relatorio: null },
    ];
    const { resultado } = agruparEscolasConectadas(importacoes, escolas);
    assert.equal(resultado?.length ?? 0, 0);
  });
});

describe('competencia.js — chamadas Bubble com constraints', () => {
  it('buscarImportacaoEscola passa constraints de data_relatorio', async () => {
    let chamada;
    const fakeClient = {
      fetchAll(tabela, options) {
        chamada = { tabela, options };
        return Promise.resolve([{ _id: '1', inep: '1001', data_relatorio: '2026-09-05T00:00:00Z' }]);
      },
    };

    const res = await buscarImportacaoEscola(fakeClient, {
      inicio: '2026-09-01T00:00:00.000Z',
      fim: '2026-10-01T00:00:00.000Z',
    });

    assert.equal(chamada.tabela, 'importação_escola');
    const constraints = JSON.parse(chamada.options.constraints);
    assert.equal(constraints.length, 2);
    assert.equal(constraints[0].key, 'data_relatorio');
    assert.equal(constraints[0].constraint_type, 'greater than');
    assert.equal(constraints[1].constraint_type, 'less than');
    assert.equal(res.length, 1);
  });

  it('buscarEscolasPorIneps fatia lotes de ineps via constraint in', async () => {
    const chamadas = [];
    const fakeClient = {
      fetchAll(tabela, options) {
        chamadas.push({ tabela, options });
        return Promise.resolve([]);
      },
    };

    const ineps = Array.from({ length: 5 }, (_, i) => `100${i}`);
    await buscarEscolasPorIneps(fakeClient, ineps, { batchSize: 2 });

    assert.equal(chamadas.length, 3); // 2 + 2 + 1
    assert.equal(chamadas[0].tabela, 'Escolas');
    const c0 = JSON.parse(chamadas[0].options.constraints);
    assert.equal(c0[0].key, 'INEP');
    assert.equal(c0[0].constraint_type, 'in');
    assert.deepEqual(c0[0].value, ['1000', '1001']);
  });

  it('obterEscolasConectadasNoMes orquestra a busca e agrupamento', async () => {
    const fakeClient = {
      fetchAll(tabela) {
        if (tabela === 'importação_escola') {
          return Promise.resolve([
            { inep: '2001', data_relatorio: '2026-09-03T00:00:00Z' },
          ]);
        }
        if (tabela === 'Escolas') {
          return Promise.resolve([
            { _id: 'esc-2001', INEP: '2001', 'Status Geral': 'Conectada' },
          ]);
        }
        return Promise.resolve([]);
      },
    };

    const res = await obterEscolasConectadasNoMes(fakeClient, { mes: '2026-09' });
    assert.equal(res.rotulo, '2026-09');
    assert.equal(res.porInep.size, 1);
    assert.equal(res.porInep.get('2001')?.dataRelatorio, '2026-09-03T00:00:00Z');
  });

  it('carregarDadosMes carrega apenas os dados do mês e dependências', async () => {
    const chamadas = [];
    const fakeClient = {
      fetchAll(tabela, options = {}) {
        chamadas.push({ tabela, options });
        if (tabela === 'importação_escola') {
          return Promise.resolve([
            { inep: '3001', data_relatorio: '2026-09-02T00:00:00Z' },
          ]);
        }
        if (tabela === 'Escolas') {
          return Promise.resolve([
            { _id: 'esc-3001', INEP: '3001', 'Status Geral': 'Conectada' },
          ]);
        }
        if (tabela === 'FR_OSP') {
          return Promise.resolve([
            {
              _id: 'fr-1',
              Escola: 'esc-3001',
              INEP: '3001',
              OSP: 'osp-1',
              'lista de contratos_instalação': ['item-1'],
            },
          ]);
        }
        if (tabela === 'contrato_taxa_instalacao') {
          return Promise.resolve([
            { _id: 'item-1', Descrição: 'Item 1' },
          ]);
        }
        if (tabela === 'OSP') {
          return Promise.resolve([
            { _id: 'osp-1', OSnum: '101' },
          ]);
        }
        if (tabela === 'fornecedor') {
          return Promise.resolve([
            { _id: 'forn-1', 'Nome Fantasia': 'Forn 1' },
          ]);
        }
        return Promise.resolve([]);
      },
    };

    const dados = await carregarDadosMes(fakeClient, { mes: '2026-09' });

    assert.equal(dados.FR_OSP.length, 1);
    assert.equal(dados.contrato_taxa_instalacao.length, 1);
    assert.equal(dados.OSP.length, 1);
    assert.equal(dados.fornecedor.length, 1);
    assert.equal(dados.Escolas.length, 1);
    assert.equal(dados.conexoesPorInep.get('3001')?.dataRelatorio, '2026-09-02T00:00:00Z');
  });
});
