// Formatação no padrão da extração OSP: datas dd/mm/aaaa e números pt-BR.

export function data(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Bubble devolve UTC; a extração usa o dia no fuso de São Paulo.
  const [dia, mes, ano] = d
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .split('/');
  return `${dia}/${mes}/${ano}`;
}

/** 2286.4 -> "2.286,40" (com separador de milhar) */
export function moeda(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
