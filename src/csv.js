/**
 * Quebra de linha dentro de uma célula vira espaço. O escape RFC 4180 já daria
 * conta dela (a célula sai entre aspas), mas quem lê o arquivo sem respeitar as
 * aspas parte a linha no meio: o resto das colunas vira uma linha nova, que
 * começa com o separador e o campo seguinte cai debaixo da primeira coluna.
 * Como nenhuma coluna do relatório quer texto de várias linhas, é mais barato
 * tirar a quebra do que confiar no leitor.
 */
const umaLinha = (texto) => texto.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/** Renders a JSON value as a CSV cell; objects and lists stay as compact JSON. */
export function formatValue(value) {
  if (value === null || value === undefined) return '';
  switch (typeof value) {
    case 'string':
      return umaLinha(value);
    case 'number':
      return Number.isFinite(value) ? String(value) : '';
    case 'boolean':
      return String(value);
    default:
      return umaLinha(JSON.stringify(value));
  }
}

/** Quotes a cell per RFC 4180 when it contains the separator, quotes or newlines. */
export function escapeCell(text, separator) {
  if (text.includes('"') || text.includes(separator) || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toRow(values, separator) {
  return values.map((v) => escapeCell(formatValue(v), separator)).join(separator) + '\r\n';
}

export function headerRow(cols, separator) {
  return cols.map((c) => escapeCell(c, separator)).join(separator) + '\r\n';
}
