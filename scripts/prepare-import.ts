import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { buildPeriods } from '../src/lib/data.ts';
import { normalizeLegacyDeputies, legacyDeputiesUrl } from '../src/lib/legacy.ts';
import { normalizeBulkExpense, parseSemicolonCsv, unzipSingleCsv } from '../src/lib/bulk.ts';
import { ingestLegislation } from '../src/lib/legislation.ts';

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error('Uso: node --experimental-strip-types scripts/prepare-import.ts <fontes> <saída>');
const sourceDir = resolve(sourceArg);
const outputDir = resolve(outputArg);
await mkdir(outputDir, { recursive: true });
const readJson = async (name: string) => JSON.parse(await readFile(`${sourceDir}/${name}`, 'utf8'));
const catalogMeta = await readJson('deputies-sp.json');
const expensesMeta = await readJson('cota-2026-metadata.json');
const legislationMeta = await readJson('vote-datasets-metadata.json');
const period = buildPeriods(new Date(catalogMeta.fetchedAt))[0]!;
if (period.start.slice(0, 4) !== '2026' || period.end.slice(0, 4) !== '2026') throw new Error('Este bootstrap valida o lote de 2026; use o coletor para outros anos.');
const xml = await readFile(`${sourceDir}/legacy-deputies-http.sample`, 'utf8');
const deputies = normalizeLegacyDeputies(xml, catalogMeta.fetchedAt);
if (deputies.length !== catalogMeta.spRecords) throw new Error('Contagem do catálogo diverge dos metadados');
const ids = new Set(deputies.map(deputy => deputy.id));
const files: { file: string; key: string; sourceUrl: string; sha256: string; fetchedAt: string }[] = [];
const verifyFile = async (file: string, expected: string | undefined, sourceUrl: string, fetchedAt: string) => {
  const buffer = await readFile(`${sourceDir}/${file}`);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  if (expected && sha256 !== expected) throw new Error(`Hash divergente: ${file}`);
  const key = `sources/bootstrap/${sha256}/${file}`;
  files.push({ file: `${sourceDir}/${file}`, key, sourceUrl, sha256, fetchedAt });
  return key;
};
const catalogKey = await verifyFile('legacy-deputies-http.sample', undefined, legacyDeputiesUrl, catalogMeta.fetchedAt);
const expenseKey = await verifyFile('Ano-2026.csv.zip', expensesMeta.sha256, expensesMeta.sourceUrl, expensesMeta.fetchedAt);
const legislationKeys: string[] = [];
for (const name of ['votacoes', 'votacoesVotos', 'votacoesProposicoes', 'proposicoes', 'proposicoesAutores']) {
  const meta = legislationMeta.files[`${name}-2026`];
  legislationKeys.push(await verifyFile(`${name}-2026.csv`, meta.sha256, meta.sourceUrl, legislationMeta.fetchedAt));
}
const version = `bootstrap:${createHash('sha256').update(files.map(file => file.sha256).join(':')).digest('hex').slice(0, 24)}`;
const sql = createWriteStream(`${outputDir}/import.sql`);
const quote = (value: string | number) => typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;
const emit = async (statement: string) => { if (!sql.write(`${statement};\n`)) await once(sql, 'drain'); };
const record = async (scope: string, item: { id: string; date: string }) => {
  await emit(`INSERT OR IGNORE INTO records(scope,version,id,date,data) VALUES(${[scope, version, item.id, item.date, JSON.stringify(item)].map(quote).join(',')})`);
};
const datasets: (string | number)[][] = [];
const snapshot = (scope: string, count: number, fetchedAt: string, sourceUrl: string, rawKey: string) => datasets.push([scope, version, period.start, period.end, fetchedAt, count, sourceUrl, rawKey]);
for (const deputy of deputies) {
  await emit(`INSERT INTO deputies(id,data,source_url,fetched_at,catalog_version,active) VALUES(${[deputy.id, JSON.stringify(deputy), deputy.sourceUrl, deputy.fetchedAt, version, 1].map(quote).join(',')}) ON CONFLICT(id) DO UPDATE SET data=excluded.data,source_url=excluded.source_url,fetched_at=excluded.fetched_at,catalog_version=excluded.catalog_version,active=1`);
}
await emit(`UPDATE deputies SET active=0 WHERE catalog_version<>${quote(version)}`);
snapshot('catalog', deputies.length, catalogMeta.fetchedAt, legacyDeputiesUrl, catalogKey);
const counts = new Map(deputies.map(deputy => [deputy.id, { expenses: 0, cents: 0, missing: 0, votes: 0, proposals: 0 }]));
const zip = await readFile(`${sourceDir}/Ano-2026.csv.zip`);
for await (const { row, index } of parseSemicolonCsv(unzipSingleCsv(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer))) {
  const item = normalizeBulkExpense(row, index);
  if (!item || !ids.has(item.deputyId) || item.expense.date < period.start || item.expense.date > period.end) continue;
  const count = counts.get(item.deputyId)!;
  count.expenses++;
  count.cents += item.expense.amountCents ?? 0;
  count.missing += item.expense.amountCents === null ? 1 : 0;
  await record(`expenses:${item.deputyId}`, item.expense);
}
const stream = (name: string) => Readable.toWeb(createReadStream(`${sourceDir}/${name}-2026.csv`)) as ReadableStream<Uint8Array>;
const legislative = await ingestLegislation({ votations: stream('votacoes'), votes: stream('votacoesVotos'), affected: stream('votacoesProposicoes'), proposals: stream('proposicoes'), authors: stream('proposicoesAutores') }, ids, period);
for (const deputy of deputies) {
  const count = counts.get(deputy.id)!;
  for (const kind of ['votes', 'proposals'] as const) {
    const records = legislative[kind].get(deputy.id) ?? [];
    count[kind] = records.length;
    for (const item of records) await record(`${kind}:${deputy.id}`, item);
    snapshot(`${kind}:${deputy.id}`, records.length, legislationMeta.fetchedAt, 'https://dadosabertos.camara.leg.br/swagger/api.html?tab=staticfile', JSON.stringify(legislationKeys));
  }
  snapshot(`expenses:${deputy.id}`, count.expenses, expensesMeta.fetchedAt, expensesMeta.sourceUrl, expenseKey);
}
for (const dataset of datasets) await emit(`INSERT INTO datasets(scope,version,since,until,fetched_at,count,source_url,raw_key) VALUES (${dataset.map(quote).join(',')}) ON CONFLICT(scope) DO UPDATE SET version=excluded.version,since=excluded.since,until=excluded.until,fetched_at=excluded.fetched_at,count=excluded.count,source_url=excluded.source_url,raw_key=excluded.raw_key`);
sql.end();
await once(sql, 'finish');
await writeFile(`${outputDir}/manifest.json`, JSON.stringify({ version, period, files, profiles: deputies.length, counts: Object.fromEntries(counts) }, null, 2));
console.log(JSON.stringify({ version, period, profiles: deputies.length, expenses: [...counts.values()].reduce((total, count) => total + count.expenses, 0), votes: [...counts.values()].reduce((total, count) => total + count.votes, 0), proposals: [...counts.values()].reduce((total, count) => total + count.proposals, 0), adriana: counts.get('204528') }));
