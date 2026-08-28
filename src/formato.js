// Formatação no padrão da extração OSP: datas dd/mm/aaaa e números pt-BR.

// Os formatadores do Intl são caros de construir: `toLocaleDateString` monta um
// novo a cada chamada e a extração faz ~200 mil delas. Construir uma vez só
// derruba essa etapa de ~4s para ~0,1s.
const FMT_DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const FMT_MOEDA = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// A mesma data ISO se repete muito entre linhas da mesma OSP.
const cacheData = new Map();

export function data(iso) {
  if (!iso) return '';
  const emCache = cacheData.get(iso);
  if (emCache !== undefined) return emCache;

  const d = new Date(iso);
  // Bubble devolve UTC; a extração usa o dia no fuso de São Paulo.
  const texto = Number.isNaN(d.getTime()) ? '' : FMT_DATA.format(d);
  cacheData.set(iso, texto);
  return texto;
}

/** 2286.4 -> "2.286,40" (com separador de milhar) */
export function moeda(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return FMT_MOEDA.format(v);
}

/** 2286.4 -> "2286,40" (sem separador de milhar, como na coluna Valor Produto) */
export function decimal(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toFixed(2).replace('.', ',');
}

export function simNao(v) {
  if (v === true) return 'sim';
  if (v === false) return 'não';
  return '';
}

/** Extrai o nome do arquivo de uma URL do S3 do Bubble. */
export function nomeArquivo(url) {
  if (!url) return '';
  const nome = String(url).split('/').pop() ?? '';
  try {
    return decodeURIComponent(nome);
  } catch {
    return nome;
  }
}

/** Nome de arquivo seguro, no padrão STEIN_TELECOM_LTDA__filial_PA_. */
export function nomeSeguro(texto) {
  return String(texto || 'SEM_FORNECEDOR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]/g, '_');
}
