// Regras de competência mensal e resolução de escolas conectadas
// a partir da tabela importação_escola do Bubble.

/**
 * Calcula os limites ISO UTC do mês de competência.
 * Aceita 'atual' (ou undefined) para o mês corrente, ou 'YYYY-MM' (ex: '2026-09').
 *
 * @param {string} [mes='atual']
 * @param {Date} [agora=new Date()]
 * @returns {{ inicio: string, fim: string, ano: number, mes: number, rotulo: string }}
 */
export function intervaloDoMes(mes = 'atual', agora = new Date()) {
  let ano;
  let mesNum;

  if (!mes || mes === 'atual') {
    ano = agora.getUTCFullYear();
    mesNum = agora.getUTCMonth() + 1; // 1-12
  } else {
    const str = String(mes).trim();
    const match = /^(\d{4})-(\d{2})$/.exec(str);
    if (!match) {
      throw new Error(`formato de mês inválido: "${mes}". Use "atual" ou "YYYY-MM" (ex: 2026-09)`);
    }
    ano = Number(match[1]);
    mesNum = Number(match[2]);
    if (mesNum < 1 || mesNum > 12) {
      throw new Error(`mês fora do intervalo 01-12: "${mes}"`);
    }
  }

  const inicio = new Date(Date.UTC(ano, mesNum - 1, 1, 0, 0, 0)).toISOString();
  const proximoAno = mesNum === 12 ? ano + 1 : ano;
  const proximoMes = mesNum === 12 ? 0 : mesNum;
  const fim = new Date(Date.UTC(proximoAno, proximoMes, 1, 0, 0, 0)).toISOString();
  const rotulo = `${ano}-${String(mesNum).padStart(2, '0')}`;

  return { inicio, fim, ano, mes: mesNum, rotulo };
}

/**
 * Agrupa registros de importação_escola por INEP, elegendo a data_relatorio
 * mais recente de cada escola, e filtra apenas aquelas cujo Status Geral seja 'Conectada'.
 *
 * @param {Array<object>} importacoes registros da tabela importação_escola
 * @param {Array<object>|Map<string, object>} escolas lista ou mapa de escolas
 * @returns {{
 *   porInep: Map<string, { inep: string, dataRelatorio: string, escolaId: string, escola: object }>,
 *   porEscolaId: Map<string, { inep: string, dataRelatorio: string, escolaId: string, escola: object }>,
 *   escolas: Array<{ inep: string, dataRelatorio: string, escolaId: string, escola: object }>
 * }}
 */
export function agruparEscolasConectadas(importacoes = [], escolas = []) {
  const escolaPorInep = escolas instanceof Map
    ? escolas
    : new Map(escolas.map((e) => [String(e.INEP ?? e.inep ?? '').trim(), e]));

  // 1. Agrupa por INEP e seleciona o registro com data_relatorio mais recente
  const porInepCru = new Map();
  for (const imp of importacoes) {
    const inep = String(imp.inep ?? imp.INEP ?? '').trim();
    if (!inep) continue;
    const dataRel = imp.data_relatorio;
    if (!dataRel) continue;

    if (!porInepCru.has(inep)) {
      porInepCru.set(inep, imp);
    } else {
      const anterior = porInepCru.get(inep);
      if (new Date(dataRel).getTime() > new Date(anterior.data_relatorio).getTime()) {
        porInepCru.set(inep, imp);
      }
    }
  }

  // 2. Filtra apenas escolas com Status Geral = Conectada
  const porInep = new Map();
  const porEscolaId = new Map();
  const lista = [];

  for (const [inep, imp] of porInepCru) {
    const escola = escolaPorInep.get(inep);
    const statusGeral = escola?.['Status Geral'] ?? escola?.statusGeral;
    if (statusGeral === 'Conectada') {
      const entrada = {
        inep,
        escolaId: escola._id ?? '',
        dataRelatorio: imp.data_relatorio,
        escola,
        registroImportacao: imp,
      };
      porInep.set(inep, entrada);
      if (entrada.escolaId) {
        porEscolaId.set(entrada.escolaId, entrada);
      }
      lista.push(entrada);
    }
  }

  return {
    porInep,
    porEscolaId,
    escolas: lista,
  };
}

/**
 * Busca registros de importação_escola com data_relatorio entre inicio e fim.
 *
 * @param {object} client cliente Bubble
 * @param {object} opcoes
 * @param {string} opcoes.inicio data ISO inicial
 * @param {string} opcoes.fim data ISO final
 * @param {(fetched: number, total: number) => void} [opcoes.onProgress]
 */
export async function buscarImportacaoEscola(client, { inicio, fim, onProgress } = {}) {
  const constraints = JSON.stringify([
    { key: 'data_relatorio', constraint_type: 'greater than', value: inicio },
    { key: 'data_relatorio', constraint_type: 'less than', value: fim },
  ]);
  return client.fetchAll('importação_escola', { constraints }, onProgress);
}

/**
 * Busca escolas no Bubble filtrando por lotes de INEPs via constraint 'in'.
 * Evita baixar 53.000 escolas do banco inteiro.
 *
 * @param {object} client cliente Bubble
 * @param {Array<string>} ineps lista de códigos INEP
 * @param {object} [opcoes]
 * @param {number} [opcoes.batchSize=50]
 */
export async function buscarEscolasPorIneps(client, ineps, { batchSize = 50 } = {}) {
  const unicos = [...new Set(ineps.map((i) => String(i ?? '').trim()).filter(Boolean))];
  if (unicos.length === 0) return [];

  const lotes = [];
  for (let i = 0; i < unicos.length; i += batchSize) {
    lotes.push(unicos.slice(i, i + batchSize));
  }

  const resultados = await Promise.all(
    lotes.map(async (lote) => {
      const constraints = JSON.stringify([
        { key: 'INEP', constraint_type: 'in', value: lote },
      ]);
      return client.fetchAll('Escolas', { constraints });
    }),
  );

  return resultados.flat();
}

/**
 * Orquestra a obtenção de escolas conectadas no mês:
 * 1. Calcula o período do mês.
 * 2. Baixa as importações de importação_escola do mês.
 * 3. Se uma base de escolas não for fornecida, busca no Bubble apenas as escolas
 *    referenciadas pelas importações (em lotes de INEP).
 * 4. Agrupa e filtra por Status Geral = 'Conectada'.
 */
export async function obterEscolasConectadasNoMes(client, { mes = 'atual', inicio, fim, escolas, onProgress } = {}) {
  const intervalo = (inicio && fim)
    ? { inicio, fim, rotulo: mes || 'personalizado' }
    : intervaloDoMes(mes);

  const importacoes = await buscarImportacaoEscola(client, {
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    onProgress,
  });

  let baseEscolas = escolas;
  if (!baseEscolas) {
    const ineps = [...new Set(importacoes.map((i) => i.inep).filter(Boolean))];
    baseEscolas = await buscarEscolasPorIneps(client, ineps);
  }

  const agrupamento = agruparEscolasConectadas(importacoes, baseEscolas);

  return {
    ...agrupamento,
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    rotulo: intervalo.rotulo,
  };
}

/**
 * Busca registros por lotes de IDs em qualquer tabela do Bubble via constraint 'in'.
 *
 * @param {object} client cliente Bubble
 * @param {string} tabela nome da tabela
 * @param {Array<string>} ids lista de identificadores
 * @param {object} [opcoes]
 * @param {number} [opcoes.batchSize=50]
 * @param {string} [opcoes.campo='_id']
 * @param {(concluidos: number, total: number) => void} [opcoes.onProgress]
 */
export async function buscarPorIds(client, tabela, ids, { batchSize = 50, campo = '_id', onProgress } = {}) {
  const unicos = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (unicos.length === 0) return [];

  const lotes = [];
  for (let i = 0; i < unicos.length; i += batchSize) {
    lotes.push(unicos.slice(i, i + batchSize));
  }

  let concluidos = 0;
  const resultados = await Promise.all(
    lotes.map(async (lote) => {
      const constraints = JSON.stringify([
        { key: campo, constraint_type: 'in', value: lote },
      ]);
      const res = await client.fetchAll(tabela, { constraints });
      concluidos += lote.length;
      onProgress?.(concluidos, unicos.length);
      return res;
    }),
  );

  return resultados.flat();
}

/**
 * Busca FRs adicionais vinculadas às escolas conectadas no mês (seja por ID ou INEP).
 *
 * @param {object} client cliente Bubble
 * @param {Array<string>} idsEscolas IDs das escolas no Bubble
 * @param {Array<string>} ineps códigos INEP das escolas
 */
export async function buscarFrsPorEscolas(client, idsEscolas = [], ineps = []) {
  const frsPorId = new Map();
  if (idsEscolas.length > 0) {
    const frs = await buscarPorIds(client, 'FR_OSP', idsEscolas, { campo: 'Escola' });
    for (const fr of frs) frsPorId.set(fr._id, fr);
  }
  if (ineps.length > 0) {
    const frs = await buscarPorIds(client, 'FR_OSP', ineps, { campo: 'INEP' });
    for (const fr of frs) frsPorId.set(fr._id, fr);
  }
  return [...frsPorId.values()];
}

/**
 * Executa o carregamento focado no mês:
 * 1. Identifica escolas conectadas no mês (importação_escola com data_relatorio no mês).
 * 2. Busca FRs do mês (Created Date) + FRs das escolas conectadas.
 * 3. Busca apenas os contratos, OSPs, escolas e fornecedores necessários para essas FRs.
 */
export async function carregarDadosMes(client, {
  mes = 'atual',
  onTabela,
  batchSize = 50,
} = {}) {
  const t0 = Date.now();
  const intervalo = intervaloDoMes(mes);

  // 1. Escolas conectadas no mês
  const infoConectadas = await obterEscolasConectadasNoMes(client, {
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    onProgress: (f, t) => onTabela?.({ tabela: 'importação_escola', registros: f, total: t }),
  });
  onTabela?.({ tabela: 'importação_escola', registros: infoConectadas.escolas.length, ms: Date.now() - t0 });

  // 2. FRs criadas no mês
  const tFr = Date.now();
  const constraintsMes = JSON.stringify([
    { key: 'Created Date', constraint_type: 'greater than', value: intervalo.inicio },
    { key: 'Created Date', constraint_type: 'less than', value: intervalo.fim },
  ]);
  const frsDoMes = await client.fetchAll('FR_OSP', { constraints: constraintsMes }, (f, t) => {
    onTabela?.({ tabela: 'FR_OSP (mês)', registros: f, total: t });
  });

  // FRs das escolas conectadas (inclui anteriores e do mês)
  const idsEscolasConectadas = [...infoConectadas.porEscolaId.keys()];
  const inepsConectadas = [...infoConectadas.porInep.keys()];
  const frsConectadas = await buscarFrsPorEscolas(client, idsEscolasConectadas, inepsConectadas);

  // Unifica FRs sem duplicação
  const frPorId = new Map();
  for (const fr of frsDoMes) frPorId.set(fr._id, fr);
  for (const fr of frsConectadas) frPorId.set(fr._id, fr);
  const todasFrs = [...frPorId.values()];
  onTabela?.({ tabela: 'FR_OSP', registros: todasFrs.length, ms: Date.now() - tFr });

  // 3. Resolução das dependências
  // Contratos/itens
  const tItens = Date.now();
  const itemIds = new Set();
  for (const fr of todasFrs) {
    for (const id of fr['lista de contratos_instalação'] ?? []) {
      if (id) itemIds.add(id);
    }
  }
  const itens = await buscarPorIds(client, 'contrato_taxa_instalacao', [...itemIds], {
    batchSize,
    onProgress: (f, t) => onTabela?.({ tabela: 'contrato_taxa_instalacao', registros: f, total: t }),
  });
  onTabela?.({ tabela: 'contrato_taxa_instalacao', registros: itens.length, ms: Date.now() - tItens });

  // OSPs
  const tOsp = Date.now();
  const ospIds = new Set();
  for (const fr of todasFrs) {
    if (fr.OSP) ospIds.add(fr.OSP);
  }
  const osps = await buscarPorIds(client, 'OSP', [...ospIds], {
    batchSize,
    onProgress: (f, t) => onTabela?.({ tabela: 'OSP', registros: f, total: t }),
  });
  onTabela?.({ tabela: 'OSP', registros: osps.length, ms: Date.now() - tOsp });

  // Escolas adicionais (as que estão nas FRs mas não estavam entre as conectadas)
  const tEsc = Date.now();
  const escolasConhecidas = new Map(infoConectadas.escolas.map((e) => [e.escolaId, e.escola]));
  const escolaIdsFaltantes = new Set();
  for (const fr of todasFrs) {
    if (fr.Escola && !escolasConhecidas.has(fr.Escola)) {
      escolaIdsFaltantes.add(fr.Escola);
    }
  }
  for (const item of itens) {
    if (item.escola && !escolasConhecidas.has(item.escola)) {
      escolaIdsFaltantes.add(item.escola);
    }
  }
  const escolasAdicionais = await buscarPorIds(client, 'Escolas', [...escolaIdsFaltantes], {
    batchSize,
    onProgress: (f, t) => onTabela?.({ tabela: 'Escolas', registros: f, total: t }),
  });
  const todasEscolas = [...escolasConhecidas.values(), ...escolasAdicionais];
  onTabela?.({ tabela: 'Escolas', registros: todasEscolas.length, ms: Date.now() - tEsc });

  // Fornecedores (carrega cadastro com 246 linhas)
  const tForn = Date.now();
  const fornecedores = await client.fetchAll('fornecedor');
  onTabela?.({ tabela: 'fornecedor', registros: fornecedores.length, ms: Date.now() - tForn });

  return {
    FR_OSP: todasFrs,
    contrato_taxa_instalacao: itens,
    OSP: osps,
    Escolas: todasEscolas,
    fornecedor: fornecedores,
    conexoesPorInep: infoConectadas.porInep,
    conexoesPorEscolaId: infoConectadas.porEscolaId,
    mes: intervalo.rotulo,
  };
}

/**
 * Envolve carregarDadosMes com a camada de cache, se fornecida.
 */
export async function carregarDadosMesComCache(client, {
  mes = 'atual',
  ttl = 0,
  atualizar = false,
  cache,
  onTabela,
  batchSize,
} = {}) {
  const rotulo = intervaloDoMes(mes).rotulo;
  const chave = `${client.versao ?? 'live'}_dados_mes_${rotulo}`;
  if (!cache) return carregarDadosMes(client, { mes, onTabela, batchSize });

  const { dados } = await cache.obter(chave, () => carregarDadosMes(client, { mes, onTabela, batchSize }), {
    ttl,
    atualizar,
  });
  return dados;
}

