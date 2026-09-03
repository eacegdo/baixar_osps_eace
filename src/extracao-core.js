// Núcleo da "Extração completa OSP", usado pelo CLI e pela API.
// Uma linha por item de OSP, no formato do modelo: colunas humanizadas,
// datas dd/mm/aaaa e valores pt-BR.
import { comCache } from './cache.js';
import { headerRow, toRow } from './csv.js';
import { data, moeda, decimal, simNao, nomeArquivo, nomeSeguro } from './formato.js';

export const COLUNAS = [
  'Projeto', 'Cod Fornecedor', 'Fornecedor', 'CNPJ', 'Num OSP', 'Num Obra',
  'Descrição Item', 'Qnt Produto', 'Valor unite ur', 'Valor Produto', 'Prod serv',
  'Previsão de execução', 'Num provisorio', 'Validação OSP', 'Status OSP',
  'Status escola', 'Status NF Sisop', 'Num NF', 'Valor da NF', 'Fase',
  'Data envio SAP', 'Data Nota Anexada', 'Data previsão de pagamnto',
  'Titulo Aquivo NF', 'Titulo Arquivo XML', 'Numero do esboço', 'Enviado SAP',
  'Data conexão escola teste', 'Motivo da reprovação', 'ID Sisop',
];

const TABELAS = ['FR_OSP', 'contrato_taxa_instalacao', 'OSP', 'Escolas', 'fornecedor'];

/**
 * Baixa as cinco tabelas em paralelo. O cliente já limita as requisições em voo
 * globalmente, então disparar tudo de uma vez não sobrecarrega o Bubble.
 */
export async function carregarDados(client, { ttl = 0, atualizar = false, onTabela } = {}) {
  const entradas = await Promise.all(
    TABELAS.map(async (tabela) => {
      const inicio = Date.now();
      // A versão entra na chave para o cache da test não se passar pelo da live.
      // A live fica sem prefixo, para os arquivos já gravados continuarem valendo.
      const chave = client.versao === 'test' ? `test_${tabela}` : tabela;
      const { dados, doCache } = await comCache(chave, ttl, () => client.fetchAll(tabela), {
        ignorar: atualizar,
      });
      onTabela?.({ tabela, registros: dados.length, ms: Date.now() - inicio, doCache });
      return [tabela, dados];
    }),
  );
  return Object.fromEntries(entradas);
}

const porId = (registros) => new Map(registros.map((r) => [r._id, r]));

/** Monta as linhas da extração a partir das tabelas cruas. */
export function gerarLinhas(dados) {
  const frs = dados.FR_OSP;
  const itemPorId = porId(dados.contrato_taxa_instalacao);
  const escolaPorId = porId(dados.Escolas);
  const fornecedorPorId = porId(dados.fornecedor);

  // A OSP guarda a lista de FRs; inverte para achar a OSP de cada FR.
  // Fallback: FR.OSP, para FR cujo vínculo só existe nesse lado (OSP ainda provisória).
  const ospPorId = porId(dados.OSP);
  const ospPorFr = new Map();
  for (const osp of dados.OSP) {
    for (const frId of osp.FR ?? []) ospPorFr.set(frId, osp);
  }

  const montar = (fr, item) => {
    const osp = ospPorFr.get(fr._id) ?? ospPorId.get(fr.OSP) ?? {};
    const escola = escolaPorId.get(item?.escola ?? fr.Escola) ?? {};
    const fornecedor = fornecedorPorId.get(item?.Fornecedor ?? osp.Fornecedor) ?? {};
    // Só o número definitivo do portal; provisório fica em Num provisorio.
    const numOsp = osp.OSnum ?? '';

    return {
      'Projeto': escola.INEP ?? fr.INEP ?? '',
      'Cod Fornecedor': fornecedor.cod_aniel ?? '',
      'Fornecedor': fornecedor['Nome Fantasia'] ?? '',
      'CNPJ': fornecedor.CNPJ ?? '',
      'Num OSP': numOsp,
      'Num Obra': item?.['Numero da obra'] ?? fr.Tipo ?? '',
      'Descrição Item': item?.['Descrição'] ?? '',
      'Qnt Produto': item?.Quantidade ?? '',
      'Valor unite ur': moeda(item?.['Valor Unitário']),
      'Valor Produto': decimal(item?.['Valor Total']),
      'Prod serv': item?.['produto/serviço'] ?? '',
      'Previsão de execução': data(item?.['Previsão de execução'] ?? osp['Previsão de entrega']),
      'Num provisorio': osp.num_prov ?? item?.['Num Provisório'] ?? '',
      // A OSP só ganha número definitivo depois de aprovada; antes vale o provisório.
      'Validação OSP': numOsp ? 'Aprovado' : 'Provisório',
      'Status OSP': osp.status ?? '',
      'Status escola': escola['Status Geral'] ?? '',
      'Status NF Sisop': fr.status ?? '',
      'Num NF': fr.NotaFiscal_numero ?? '',
      // Mesma fonte da tela do SISOP: o 'Valor Total' do item, não o campo da FR.
      // É o mesmo número de 'Valor Produto', só que com separador de milhar.
      'Valor da NF': moeda(item?.['Valor Total']),
      'Fase': escola.FASE ?? '',
      'Data envio SAP': data(fr['enviado data sap']),
      'Data Nota Anexada': data(fr['Data envio nota 1']),
      'Data previsão de pagamnto': data(fr['data prevista para pagamento'] ?? item?.pago_em),
      'Titulo Aquivo NF': nomeArquivo(fr['Nota fiscal']),
      'Titulo Arquivo XML': nomeArquivo(fr.XML),
      'Numero do esboço': fr.Id_SAP_nota_draft ?? '',
      'Enviado SAP': simNao(fr['Enviado para SAP']),
      'Data conexão escola teste': data(escola['Ativação GERAL']),
      'Motivo da reprovação': fr.Recusa_texto ?? '',
      'ID Sisop': fr._id,
      // Ids do Bubble para os filtros; não saem no CSV, que usa COLUNAS.
      _fornecedorId: fornecedor._id ?? '',
      _ospId: osp._id ?? '',
      _escolaId: escola._id ?? '',
    };
  };

  // Uma linha por item da FR; FR sem item vira uma linha só, para não sumir do relatório.
  const linhas = [];
  for (const fr of frs) {
    const ids = fr['lista de contratos_instalação'] ?? [];
    if (ids.length === 0) {
      linhas.push(montar(fr, null));
      continue;
    }
    for (const id of ids) linhas.push(montar(fr, itemPorId.get(id)));
  }
  return linhas;
}

// '*' (ou vazio) significa "todos" — assim dá para montar a URL sempre com o
// parâmetro presente, sem precisar removê-lo para pedir tudo.
const todos = (v) => v === undefined || v === null || v === '' || v === '*';

/** Unique id do Bubble tem a forma 1762783246679x935360833626223100. */
const ehIdBubble = (v) => /^\d+x\d+$/.test(String(v));

const igual = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/**
 * `fornecedorId` e `ospId` filtram pelo unique id do Bubble. `fornecedor` e
 * `numOsp` aceitam o valor legível (definitivo ou provisório) ou o próprio id.
 */
export function filtrar(linhas, { fornecedor, fornecedorId, status, numOsp, ospId } = {}) {
  const testes = [];

  if (!todos(fornecedorId)) testes.push((l) => l._fornecedorId === fornecedorId);
  if (!todos(ospId)) testes.push((l) => l._ospId === ospId);

  if (!todos(fornecedor)) {
    testes.push(
      ehIdBubble(fornecedor)
        ? (l) => l._fornecedorId === fornecedor
        : (l) => igual(l.Fornecedor, fornecedor),
    );
  }
  if (!todos(numOsp)) {
    testes.push(
      ehIdBubble(numOsp)
        ? (l) => l._ospId === numOsp
        // Aceita número definitivo ou provisório (FR ainda sem OSnum no portal).
        : (l) => String(l['Num OSP']) === String(numOsp)
          || String(l['Num provisorio']) === String(numOsp),
    );
  }
  if (!todos(status)) testes.push((l) => igual(l['Status OSP'], status));

  return testes.length === 0 ? linhas : linhas.filter((l) => testes.every((t) => t(l)));
}

/**
 * Agrupa por fornecedor e fatia em partes de no máximo maxLinhas, sem cortar
 * uma OSP ao meio (é assim que o modelo se comporta).
 */
export function particionar(linhas, maxLinhas = 1500) {
  const porFornecedor = new Map();
  for (const linha of linhas) {
    const chave = linha.Fornecedor || 'SEM_FORNECEDOR';
    if (!porFornecedor.has(chave)) porFornecedor.set(chave, []);
    porFornecedor.get(chave).push(linha);
  }

  const arquivos = [];
  for (const [fornecedor, doFornecedor] of [...porFornecedor].sort(([a], [b]) => a.localeCompare(b))) {
    doFornecedor.sort((a, b) => Number(a['Num OSP'] || 0) - Number(b['Num OSP'] || 0));

    const partes = [];
    let atual = [];
    for (const linha of doFornecedor) {
      if (atual.length >= maxLinhas && linha['Num OSP'] !== atual.at(-1)['Num OSP']) {
        partes.push(atual);
        atual = [];
      }
      atual.push(linha);
    }
    if (atual.length > 0) partes.push(atual);

    partes.forEach((parte, i) => {
      arquivos.push({ nome: `${nomeSeguro(fornecedor)}_Parte_${i + 1}.csv`, linhas: parte });
    });
  }
  return arquivos;
}

/** Gera o CSV pedaço a pedaço, para poder ir direto para o disco ou para a resposta HTTP. */
export function* csvChunks(linhas, sep = ',', comBom = false) {
  if (comBom) yield '﻿';
  yield headerRow(COLUNAS, sep);
  for (const linha of linhas) yield toRow(COLUNAS.map((c) => linha[c]), sep);
}

export function csvCompleto(linhas, sep = ',', comBom = false) {
  return [...csvChunks(linhas, sep, comBom)].join('');
}
