import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { normalizeBulkExpense, parseSemicolonCsv, unzipSingleCsv } from './bulk.ts';

function stream(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(encoder.encode(part)); controller.close(); } });
}

test('bulk normalization keeps competence, reversal and source row identity', () => {
  const row = { ideCadastro: '123', numAno: '2026', numMes: '9', vlrLiquido: '-12,50', datEmissao: '2026-10-03T00:00:00', txtDescricao: 'TRANSPORTE', txtFornecedor: 'Fornecedor A', urlDocumento: 'https://www.camara.leg.br/recibo.pdf' };
  const first = normalizeBulkExpense(row, 19);
  const second = normalizeBulkExpense(row, 20);
  assert.equal(first?.deputyId, '123');
  assert.equal(first?.expense.date, '2026-09-01');
  assert.equal(first?.expense.documentDate, '2026-10-03');
  assert.equal(first?.expense.amountCents, -1250);
  assert.notEqual(first?.expense.id, second?.expense.id);
  assert.equal(normalizeBulkExpense({ ...row, ideCadastro: '' }, 21), null);
  assert.equal(normalizeBulkExpense({ ...row, vlrLiquido: '' }, 22)?.expense.amountCents, null);
  assert.throws(() => normalizeBulkExpense(row), /ordinal/);
});

test('CSV parser handles BOM, quoted semicolons, newlines and chunk boundaries', async () => {
  const parts = ['\uFEFF"ideCadastro";"numAno";"numMes";"vlrLiquido";"txtFornecedor"\n"123";"2026";"9";"1,20";"A;', 'B"\n"123";"2026";"9";"-0,01";"Linha ', '1\nLinha 2"\n'];
  const records = [];
  for await (const value of parseSemicolonCsv(stream(parts))) records.push(value);
  assert.deepEqual(records.map(({ index }) => index), [1, 2]);
  assert.equal(records[0]?.row.txtFornecedor, 'A;B');
  assert.equal(records[1]?.row.txtFornecedor, 'Linha 1\nLinha 2');
  assert.equal(normalizeBulkExpense(records[1]!.row, records[1]!.index)?.expense.amountCents, -1);
});

test('CSV parser validates supplied headers and rejects broken rows', async () => {
  const rows = [];
  for await (const value of parseSemicolonCsv(stream(['"id";"title"\n"1";"hello"\n']), ['id', 'title'])) rows.push(value);
  assert.equal(rows[0]?.row.title, 'hello');
  await assert.rejects(async () => { for await (const _ of parseSemicolonCsv(stream(['"id"\n"1"\n']), ['title'])) {} }, /Cabeçalho/);
  await assert.rejects(async () => { for await (const _ of parseSemicolonCsv(stream(['"id";"title"\n"1"\n']), ['id', 'title'])) {} }, /colunas/);
});

test('ZIP extractor streams a single deflated CSV entry', async () => {
  const content = new TextEncoder().encode('"id";"title"\n"1";"Teste"\n');
  const compressed = deflateRawSync(content);
  const filename = new TextEncoder().encode('sample.csv');
  const local = new Uint8Array(30 + filename.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(8, 8, true);
  localView.setUint32(18, compressed.length, true);
  localView.setUint32(22, content.length, true);
  localView.setUint16(26, filename.length, true);
  local.set(filename, 30);
  const central = new Uint8Array(46 + filename.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(10, 8, true);
  centralView.setUint32(20, compressed.length, true);
  centralView.setUint32(24, content.length, true);
  centralView.setUint16(28, filename.length, true);
  central.set(filename, 46);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(16, local.length + compressed.length, true);
  const bytes = new Uint8Array(local.length + compressed.length + central.length + end.length);
  bytes.set(local);
  bytes.set(compressed, local.length);
  bytes.set(central, local.length + compressed.length);
  bytes.set(end, local.length + compressed.length + central.length);
  const records = [];
  for await (const value of parseSemicolonCsv(unzipSingleCsv(bytes.buffer), ['id', 'title'])) records.push(value);
  assert.equal(records[0]?.row.title, 'Teste');
});
