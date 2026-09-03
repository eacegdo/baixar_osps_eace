// Núcleo da "Extração completa OSP", usado pelo CLI e pela API.
// Uma linha por item de OSP, no formato do modelo: colunas humanizadas,
// datas dd/mm/aaaa e valores pt-BR.
import { cacheEmDisco } from './cache.js';
import { headerRow, toRow } from './csv.js';
import { data, moeda, decimal, simNao, nomeArquivo, nomeSeguro } from './formato.js';

/**
 * As trinta colunas do relatório, cada uma declarada uma vez: o nome que vai
 * para o cabeçalho, de onde o valor sai (`de`) e como se formata (`formato`).
 * O cabeçalho do CSV e as chaves da linha derivam desta mesma lista, então não
 * há como uma coluna existir num lado e não no outro — divergir dava coluna
 * vazia em silêncio, que é como o bug do valor da nota fiscal passou.
 *
 * `de` recebe o contexto da linha: a FR, o item, a OSP, a escola, o fornecedor
 * e o número definitivo da OSP já resolvido. É essa coluna da esquerda que se
 * confere contra a tela do SISOP.
 */
const COLUNAS_DEF = [
  { nome: 'Projeto', de: ({ escola, fr }) => escola.INEP ?? fr.INEP },
  { nome: 'Cod Fornecedor', de: ({ fornecedor }) => fornecedor.cod_aniel },
  { nome: 'Fornecedor', de: ({ fornecedor }) => fornecedor['Nome Fantasia'] },
  { nome: 'CNPJ', de: ({ fornecedor }) => fornecedor.CNPJ },
  // Só o número definitivo do portal; provisório fica em Num provisorio.
  { nome: 'Num OSP', de: ({ numOsp }) => numOsp },
  { nome: 'Num Obra', de: ({ item, fr }) => item?.['Numero da obra'] ?? fr.Tipo },
  { nome: 'Descrição Item', de: ({ item }) => item?.['Descrição'] },
  { nome: 'Qnt Produto', de: ({ item }) => item?.Quantidade },
  { nome: 'Valor unite ur', de: ({ item }) => item?.['Valor Unitário'], formato: moeda },
  { nome: 'Valor Produto', de: ({ item }) => item?.['Valor Total'], formato: decimal },
  { nome: 'Prod serv', de: ({ item }) => item?.['produto/serviço'] },
  {
    nome: 'Previsão de execução',
    de: ({ item, osp }) => item?.['Previsão de execução'] ?? osp['Previsão de entrega'],
    formato: data,
  },
  { nome: 'Num provisorio', de: ({ osp, item }) => osp.num_prov ?? item?.['Num Provisório'] },
  // A OSP só ganha número definitivo depois de aprovada; antes vale o provisório.
  { nome: 'Validação OSP', de: ({ numOsp }) => (numOsp ? 'Aprovado' : 'Provisório') },
  { nome: 'Status OSP', de: ({ osp }) => osp.status },
  { nome: 'Status escola', de: ({ escola }) => escola['Status Geral'] },
  { nome: 'Status NF Sisop', de: ({ fr }) => fr.status },
  { nome: 'Num NF', de: ({ fr }) => fr.NotaFiscal_numero },
  // Mesma fonte da tela do SISOP: o 'Valor Total' do item, não o campo da FR.
  // É o mesmo número de 'Valor Produto', só que com separador de milhar.
  { nome: 'Valor da NF', de: ({ item }) => item?.['Valor Total'], formato: moeda },
  { nome: 'Fase', de: ({ escola }) => escola.FASE },
  { nome: 'Data envio SAP', de: ({ fr }) => fr['enviado data sap'], formato: data },
  { nome: 'Data Nota Anexada', de: ({ fr }) => fr['Data envio nota 1'], formato: data },
  {
    nome: 'Data previsão de pagamnto',
    de: ({ fr, item }) => fr['data prevista para pagamento'] ?? item?.pago_em,
    formato: data,
  },
  { nome: 'Titulo Aquivo NF', de: ({ fr }) => fr['Nota fiscal'], formato: nomeArquivo },
  { nome: 'Titulo Arquivo XML', de: ({ fr }) => fr.XML, formato: nomeArquivo },
  { nome: 'Numero do esboço', de: ({ fr }) => fr.Id_SAP_nota_draft },
  { nome: 'Enviado SAP', de: ({ fr }) => fr['Enviado para SAP'], formato: simNao },
  { nome: 'Data conexão escola teste', de: ({ escola }) => escola['Ativação GERAL'], formato: data },
  { nome: 'Motivo da reprovação', de: ({ fr }) => fr.Recusa_texto },
  { nome: 'ID Sisop', de: ({ fr }) => fr._id },
];

/** Formato padrão: o valor como veio, e célula vazia quando não veio nada. */
const comoEsta = (v) => v ?? '';

/** Cabeçalho do CSV e chaves da linha, na ordem da declaração. */
export const COLUNAS = COLUNAS_DEF.map((c) => c.nome);
// As tabelas cruas ficam em disco entre execuções; um teste passa outro
// adapter de cache em `carregarDados`.
const disco = cacheEmDisco();

const TABELAS = ['FR_OSP', 'contrato_taxa_instalacao', 'OSP', 'Escolas', 'fornecedor'];

/**
 * Baixa as cinco tabelas em paralelo. O cliente já limita as requisições em voo
 * globalmente, então disparar tudo de uma vez não sobrecarrega o Bubble.
 */
export async function carregarDados(client, { ttl = 0, atualizar = false, onTabela, cache } = {}) {
  const entradas = await Promise.all(
    TABELAS.map(async (tabela) => {
      const inicio = Date.now();
      // A versão entra na chave para o cache da test não se passar pelo da live.
      // A live fica sem prefixo, para os arquivos já gravados continuarem valendo.
      const chave = client.versao === 'test' ? `test_${tabela}` : tabela;
      const { dados, doCache } = await (cache ?? disco).obter(chave, () => client.fetchAll(tabela), {
        ttl,
        atualizar,
      });
      onTabela?.({ tabela, registros: dados.length, ms: Date.now() - inicio, doCache });
      return [tabela, dados];
    }),
  );
  return Object.fromEntries(entradas);
}

const porId = (registros) => new Map(registros.map((r) => [r._id, r]));

/**
 * Índice dos unique ids do Bubble, por linha. Os ids servem só aos filtros, e
 * ficam aqui em vez de dentro da linha: a linha carrega as colunas do
 * relatório, e quem filtra consulta o índice.
 *
 * Ele é fraco de propósito — a entrada morre junto com a linha, então o cache
 * de linhas em memória não vira vazamento.
 */
const idsPorLinha = new WeakMap();

/** @returns {{fornecedorId: string, ospId: string, escolaId: string}} */
export const idsDe = (linha) => idsPorLinha.get(linha) ?? {};

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
    const contexto = { fr, item, osp, escola, fornecedor, numOsp: osp.OSnum ?? '' };

    const linha = {};
    for (const { nome, de, formato = comoEsta } of COLUNAS_DEF) {
      linha[nome] = formato(de(contexto));
    }
    // Só para não quebrar quem já consome a resposta json com esses campos.
    // Os filtros não os leem mais — quem lê é o índice abaixo. Quando der para
    // confirmar que ninguém depende deles, estas três linhas saem sozinhas.
    linha._fornecedorId = fornecedor._id ?? '';
    linha._ospId = osp._id ?? '';
    linha._escolaId = escola._id ?? '';

    idsPorLinha.set(linha, {
      fornecedorId: fornecedor._id ?? '',
      ospId: osp._id ?? '',
      escolaId: escola._id ?? '',
    });
    return linha;
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

  if (!todos(fornecedorId)) testes.push((l) => idsDe(l).fornecedorId === fornecedorId);
  if (!todos(ospId)) testes.push((l) => idsDe(l).ospId === ospId);

  if (!todos(fornecedor)) {
    testes.push(
      ehIdBubble(fornecedor)
        ? (l) => idsDe(l).fornecedorId === fornecedor
        : (l) => igual(l.Fornecedor, fornecedor),
    );
  }
  if (!todos(numOsp)) {
    testes.push(
      ehIdBubble(numOsp)
        ? (l) => idsDe(l).ospId === numOsp
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
