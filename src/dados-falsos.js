// Tabelas falsas do Bubble, no formato que o `client.fetchAll` devolve. Só os
// testes usam; ficam num módulo próprio porque mais de um arquivo de teste
// precisa das mesmas cinco tabelas.

export const FORN_VEGA = '100x1';
export const FORN_ORION = '100x2';
export const ESCOLA_A = '500x1';
export const ESCOLA_B = '500x2';
export const OSP_APROV = '200x1';
export const OSP_PROV = '200x2';
export const OSP_ORION = '200x3';
export const FR_APROV = '300x1';
export const FR_PROV = '300x2';
export const FR_ORION = '300x3';
export const FR_SEM_ITEM = '300x4';
const ITEM_APROV = '400x1';
const ITEM_PROV = '400x2';
const ITEM_ORION = '400x3';

/** Cinco tabelas novas a cada chamada, para um teste poder mexer nas suas. */
export const tabelasFalsas = () => ({
  fornecedor: [
    {
      _id: FORN_VEGA,
      'Nome Fantasia': 'VEGA! DIGITAL',
      CNPJ: '11.222.333/0001-44',
      cod_aniel: '136',
    },
    {
      _id: FORN_ORION,
      'Nome Fantasia': 'ORION',
      CNPJ: '55.666.777/0001-88',
      cod_aniel: '204',
    },
  ],
  Escolas: [
    {
      _id: ESCOLA_A,
      INEP: '10000001',
      'Status Geral': 'Ativada',
      FASE: 'Fase 1',
      'Ativação GERAL': '2025-03-10T12:00:00.000Z',
    },
    {
      _id: ESCOLA_B,
      INEP: '10000002',
      'Status Geral': 'Em instalação',
      FASE: 'Fase 2',
    },
  ],
  contrato_taxa_instalacao: [
    {
      _id: ITEM_APROV,
      Descrição: 'Kit aprovado',
      Quantidade: 2,
      'Valor Unitário': 1143.2,
      'Valor Total': 2286.4,
      'produto/serviço': 'Material',
      Fornecedor: FORN_VEGA,
      escola: ESCOLA_A,
      'Numero da obra': 'OB-77',
      'Previsão de execução': '2025-04-01T12:00:00.000Z',
    },
    {
      _id: ITEM_PROV,
      Descrição: 'Kit provisório',
      Quantidade: 1,
      'Valor Unitário': 100,
      'Valor Total': 100,
      'produto/serviço': 'Serviço',
      Fornecedor: FORN_VEGA,
      escola: ESCOLA_B,
      'Num Provisório': 5303,
    },
    {
      _id: ITEM_ORION,
      // Vírgula, aspas e quebra de linha, para exercitar o escape do CSV.
      Descrição: 'Fibra, 100m\ncom emenda "dupla"',
      Quantidade: 3,
      'Valor Unitário': 10,
      'Valor Total': 30,
      'produto/serviço': 'Material',
      Fornecedor: FORN_ORION,
      escola: ESCOLA_A,
    },
  ],
  OSP: [
    {
      _id: OSP_APROV,
      Fornecedor: FORN_VEGA,
      status: 'Nota Fiscal',
      OSnum: 4782,
      num_prov: 5304,
      FR: [FR_APROV],
    },
    {
      // Sem OSnum e sem lista FR: o vínculo existe só em FR.OSP.
      _id: OSP_PROV,
      Fornecedor: FORN_VEGA,
      status: 'Solicitado',
      num_prov: 5303,
    },
    {
      _id: OSP_ORION,
      Fornecedor: FORN_ORION,
      status: 'Concluído',
      OSnum: 1793,
      FR: [FR_ORION, FR_SEM_ITEM],
    },
  ],
  FR_OSP: [
    {
      _id: FR_APROV,
      OSP: OSP_APROV,
      status: 'Enviada',
      NotaFiscal_numero: '12345',
      'lista de contratos_instalação': [ITEM_APROV],
      'enviado data sap': '2025-04-05T12:00:00.000Z',
      'Enviado para SAP': true,
      'Nota fiscal': 'https://s3.amazonaws.com/appforest_uf/nota%20fiscal.pdf',
      XML: 'https://s3.amazonaws.com/appforest_uf/nota.xml',
      Id_SAP_nota_draft: '9001',
    },
    {
      _id: FR_PROV,
      OSP: OSP_PROV,
      status: 'Pendente',
      'lista de contratos_instalação': [ITEM_PROV],
    },
    {
      _id: FR_ORION,
      OSP: OSP_ORION,
      status: 'Enviada',
      'lista de contratos_instalação': [ITEM_ORION],
      'Enviado para SAP': false,
      Recusa_texto: 'Valor divergente',
    },
    {
      // FR sem item: vira uma linha só, para não sumir do relatório.
      _id: FR_SEM_ITEM,
      OSP: OSP_ORION,
      status: 'Pendente',
      Escola: '10000003',
      'lista de contratos_instalação': [],
    },
  ],
});

/**
 * Cliente do Bubble falso: mesma superfície que o `carregarDados` usa
 * (`versao` e `fetchAll`). `chamadas` conta os downloads por tabela, para um
 * teste poder afirmar que o cache evitou a segunda ida ao Bubble.
 */
export function clientFalso({ versao = 'live', tabelas = tabelasFalsas() } = {}) {
  const chamadas = [];
  return {
    versao,
    tabelas,
    chamadas,
    async fetchAll(tabela) {
      chamadas.push(tabela);
      return tabelas[tabela] ?? [];
    },
  };
}
