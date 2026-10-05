import type { Expense } from './data.ts';
import { officialUrl, toCents } from './normalize.ts';

export const bulkExpensesUrl = (year: number): string => `https://www.camara.leg.br/cotas/Ano-${year}.csv.zip`;
export type BulkExpense = { deputyId: string; expense: Expense };

function dateOnly(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] ? null : match[1];
}

export function normalizeBulkExpense(row: Record<string, string>, index?: number): BulkExpense | null {
  const deputyId = row.ideCadastro?.trim();
  if (!deputyId) return null;
  if (!/^\d+$/.test(deputyId)) throw new TypeError('CEAP sem ID de deputado válido');
  if (!Number.isSafeInteger(index) || index! < 1) throw new TypeError('CEAP exige ordinal da linha para ID estável');
  const year = Number(row.numAno);
  const month = Number(row.numMes);
  if (!Number.isInteger(year) || year < 1900 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new TypeError('CEAP sem competência válida');
  }
  const amountCents = toCents(row.vlrLiquido);
  if (row.vlrLiquido?.trim() && amountCents === null) throw new TypeError('CEAP com valor líquido inválido');
  const expense: Expense = {
    id: `ceap-${year}-${index}`,
    date: `${year}-${String(month).padStart(2, '0')}-01`,
    documentDate: dateOnly(row.datEmissao ?? ''),
    category: row.txtDescricao?.trim() || 'Não informado',
    supplier: row.txtFornecedor?.trim() || 'Não informado',
    amountCents,
    receiptUrl: officialUrl(row.urlDocumento),
  };
  return { deputyId, expense };
}

export async function* parseSemicolonCsv(stream: ReadableStream<Uint8Array>, requiredHeaders: string[] = ['ideCadastro', 'numAno', 'numMes', 'vlrLiquido']): AsyncGenerator<{ row: Record<string, string>; index: number }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let header: string[] | null = null;
  let values: string[] = [];
  let field = '';
  let quoted = false;
  let pendingQuote = false;
  let index = 0;
  const finishRow = (): { row: Record<string, string>; index: number } | null => {
    values.push(field);
    field = '';
    if (!header) {
      header = values.map((value, position) => position === 0 ? value.replace(/^\uFEFF/, '') : value);
      if (!requiredHeaders.every((key) => header!.includes(key))) {
        throw new TypeError('Cabeçalho CSV inválido');
      }
      values = [];
      return null;
    }
    if (values.length !== header.length) throw new TypeError('Linha CSV com número de colunas inválido');
    index += 1;
    const row = Object.fromEntries(header.map((key, position) => [key, values[position]!]));
    values = [];
    return { row, index };
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      const chunk = decoder.decode(done ? undefined : value, { stream: !done });
      for (const character of chunk) {
        if (quoted) {
          if (pendingQuote) {
            if (character === '"') { field += '"'; pendingQuote = false; continue; }
            quoted = false;
            pendingQuote = false;
          } else if (character === '"') {
            pendingQuote = true;
            continue;
          } else {
            field += character;
            continue;
          }
        }
        if (character === '"' && field.length === 0) quoted = true;
        else if (character === ';') { values.push(field); field = ''; }
        else if (character === '\n') {
          const record = finishRow();
          if (record) yield record;
        } else if (character !== '\r') field += character;
        if (field.length > 1_000_000 || values.length > 100) throw new TypeError('Campo CSV excede limite');
      }
      if (done) break;
    }
    if (quoted && !pendingQuote) throw new TypeError('CSV com aspas não fechadas');
    if (field || values.length) {
      const record = finishRow();
      if (record) yield record;
    }
  } finally {
    reader.releaseLock();
  }
}

export function unzipSingleCsv(buffer: ArrayBuffer): ReadableStream<Uint8Array> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || view.getUint16(eocd + 10, true) !== 1) throw new TypeError('ZIP CEAP precisa conter um CSV');
  const central = view.getUint32(eocd + 16, true);
  if (view.getUint32(central, true) !== 0x02014b50) throw new TypeError('Diretório ZIP inválido');
  const flags = view.getUint16(central + 8, true);
  const method = view.getUint16(central + 10, true);
  const compressed = view.getUint32(central + 20, true);
  const uncompressed = view.getUint32(central + 24, true);
  const filenameLength = view.getUint16(central + 28, true);
  const local = view.getUint32(central + 42, true);
  const filename = new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + filenameLength));
  if (flags & 1 || method !== 8 || compressed > 20_000_000 || uncompressed > 100_000_000 || !filename.endsWith('.csv')) {
    throw new TypeError('Arquivo ZIP CEAP não suportado');
  }
  if (view.getUint32(local, true) !== 0x04034b50) throw new TypeError('Entrada ZIP inválida');
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  if (start + compressed > central) throw new TypeError('Tamanho ZIP inválido');
  return new Blob([bytes.slice(start, start + compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
}
