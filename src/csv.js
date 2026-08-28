// Bubble's built-in fields; they lead the header when present.
const PREFERRED_FIRST = ['_id', 'Created Date', 'Modified Date', 'Created By', 'Slug'];

/**
 * Union of every key seen across records: built-in Bubble fields first, then
 * the custom fields sorted alphabetically. Bubble omits empty fields per
 * record, so the full column set is only known once every page is in.
 */
export function columns(records) {
  const seen = new Set();
  for (const record of records) {
    for (const key of Object.keys(record)) seen.add(key);
  }

  const cols = [];
  for (const key of PREFERRED_FIRST) {
    if (seen.delete(key)) cols.push(key);
  }
  return cols.concat([...seen].sort((a, b) => a.localeCompare(b)));
}

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
