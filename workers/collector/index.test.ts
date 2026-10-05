import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import collector, { cleanupExpenseRecordsSql, cleanupLegislationRecordsSql, type Env } from './index.ts';

type Job = { id: string; kind: 'catalog' | 'expenses-bulk' | 'legislation-bulk'; asOf: string };

function harness(activeIds: string[] = []) {
  const operations: { sql: string; params: unknown[] }[] = [];
  const statuses = new Map<string, string>();
  const stored = new Map<string, ArrayBuffer>();
  const sent: Job[] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) { this.params = params; return this; },
        async all() {
          operations.push({ sql, params: this.params });
          if (sql.includes('SELECT status FROM ingestion_jobs')) return { results: statuses.has(String(this.params[0])) ? [{ status: statuses.get(String(this.params[0])) }] : [] };
          if (sql.includes('SELECT id FROM deputies')) return { results: activeIds.map((id) => ({ id })) };
          if (sql.includes("id>? AND status='completed'")) return { results: [...statuses].filter(([id, status]) => id.startsWith(`${this.params[0]}:`) && id > String(this.params[1]) && status === 'completed').map(([id]) => ({ id })) };
          if (sql.includes('SELECT id FROM ingestion_jobs')) return { results: [] };
          return { results: [] };
        },
        async run() {
          operations.push({ sql, params: this.params });
          if (sql.includes("SET status='running'")) statuses.set(String(this.params[1]), 'running');
          if (sql.includes("SET status='completed'")) statuses.set(String(this.params[1]), 'completed');
          if (sql.includes("SET status='failed'")) statuses.set(String(this.params[2]), 'failed');
          if (sql.includes('INSERT INTO ingestion_jobs')) statuses.set(String(this.params[0]), 'queued');
          return { results: [], meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      for (const statement of statements) await statement.run();
      return [];
    },
  };
  const env = {
    DB: db,
    RAW: {
      async put(key: string, body: ArrayBuffer) { stored.set(key, body); },
      async get(key: string) { const body = stored.get(key); return body ? { body: new Blob([body]).stream() } : null; },
    },
    INGEST_QUEUE: { async send(job: Job) { sent.push(job); } },
  } as unknown as Env;
  return { env, operations, statuses, stored, sent };
}

async function deliver(env: Env, body: Job) {
  let acked = 0;
  let retried = 0;
  await collector.queue({ messages: [{ body, ack() { acked++; }, retry() { retried++; } }] }, env);
  return { acked, retried };
}

test('catalog message archives XML, commits valid snapshot, and enqueues independent followups', async () => {
  const state = harness();
  const job: Job = { id: 'catalog:2026-10-05', kind: 'catalog', asOf: '2026-10-05T06:00:00Z' };
  state.statuses.set(job.id, 'queued');
  const xml = '<deputados><deputado><ideCadastro>123</ideCadastro><nome>Ana Silva</nome><nomeParlamentar>Ana</nomeParlamentar><uf>SP</uf><partido>ABC</partido><urlFoto>https://www.camara.leg.br/foto.jpg</urlFoto></deputado></deputados>';
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(xml);
  try {
    assert.deepEqual(await deliver(state.env, job), { acked: 1, retried: 0 });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(state.stored.size, 1);
  assert.ok(state.operations.some(({ sql }) => sql.includes('INSERT INTO deputies')));
  assert.ok(state.operations.some(({ sql }) => sql.includes("VALUES('catalog'")));
  assert.equal(state.statuses.get(job.id), 'completed');
  assert.deepEqual(state.sent.map(({ kind }) => kind).sort(), ['expenses-bulk', 'legislation-bulk']);
});

test('completed delivery is acknowledged without fetching or republishing', async () => {
  const state = harness();
  const job: Job = { id: 'catalog:2026-10-05', kind: 'catalog', asOf: '2026-10-05T06:00:00Z' };
  state.statuses.set(job.id, 'completed');
  assert.deepEqual(await deliver(state.env, job), { acked: 1, retried: 0 });
  assert.equal(state.stored.size, 0);
  assert.equal(state.sent.length, 0);
});

test('superseded retry is acknowledged without replacing a newer snapshot', async () => {
  const state = harness();
  const old: Job = { id: 'catalog:2026-10-04', kind: 'catalog', asOf: '2026-10-04T06:00:00Z' };
  state.statuses.set(old.id, 'failed');
  state.statuses.set('catalog:2026-10-05', 'completed');
  assert.deepEqual(await deliver(state.env, old), { acked: 1, retried: 0 });
  assert.equal(state.stored.size, 0);
  assert.equal(state.statuses.get(old.id), 'failed');
});

test('invalid catalog is retried without changing the published snapshot', async () => {
  const state = harness();
  const job: Job = { id: 'catalog:2026-10-05', kind: 'catalog', asOf: '2026-10-05T06:00:00Z' };
  state.statuses.set(job.id, 'queued');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<deputados></deputados>');
  try {
    assert.deepEqual(await deliver(state.env, job), { acked: 0, retried: 1 });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(state.stored.size, 1);
  assert.ok(!state.operations.some(({ sql }) => sql.includes("VALUES('catalog'")));
  assert.equal(state.statuses.get(job.id), 'failed');
});

test('legislation message publishes votes and proposals only after all five archived sources parse', async () => {
  const state = harness(['123']);
  const job: Job = { id: 'legislation-bulk:2026-10-05', kind: 'legislation-bulk', asOf: '2026-10-05T06:00:00Z' };
  state.statuses.set(job.id, 'queued');
  const csv: Record<string, string> = {
    votacoes: 'id;data;aprovacao;descricao\n999-1;2026-09-15;1;Votação de teste\n',
    votacoesVotos: 'idVotacao;deputado_id;voto;dataHoraVoto\n999-1;123;Sim;2026-09-15T15:00:00\n',
    votacoesProposicoes: 'idVotacao;proposicao_id;proposicao_titulo\n999-1;301;PL 1/2026\n',
    proposicoes: 'id;dataApresentacao;siglaTipo;numero;ano;ementa\n301;2026-09-01;PL;1;2026;Texto de teste\n',
    proposicoesAutores: 'idProposicao;idDeputadoAutor\n301;123\n',
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const kind = /\/([^/]+)-2026\.csv$/.exec(String(input))?.[1];
    return new Response(kind ? csv[kind] : '', { status: kind && csv[kind] ? 200 : 404 });
  };
  try {
    assert.deepEqual(await deliver(state.env, job), { acked: 1, retried: 0 });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(state.stored.size, 5);
  const staged = state.operations.filter(({ sql }) => sql.includes('INSERT INTO records'));
  assert.ok(staged.length >= 1);
  const records = staged.flatMap(({ params }) => JSON.parse(String(params[1])) as { scope: string }[]);
  assert.deepEqual(records.map(({ scope }) => scope).sort(), ['proposals:123', 'votes:123']);
  const pointer = state.operations.find(({ sql }) => sql.includes('INSERT INTO datasets') && sql.includes('json_each'));
  assert.ok(pointer);
  assert.ok(state.operations.indexOf(pointer) > state.operations.indexOf(staged.at(-1)!));
  assert.deepEqual(JSON.parse(String(pointer.params[5])).map((item: { scope: string }) => item.scope), ['votes:123', 'proposals:123']);
});

test('broken second legislative source retries without publishing either dataset', async () => {
  const state = harness(['123']);
  const job: Job = { id: 'legislation-bulk:2026-10-05', kind: 'legislation-bulk', asOf: '2026-10-05T06:00:00Z' };
  state.statuses.set(job.id, 'queued');
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => new Response(String(input).includes('/votacoes/csv/')
    ? 'id;data;aprovacao;descricao\n999-1;2026-09-15;1;Votação de teste\n'
    : 'arquivo;invalido\n1;2\n');
  try {
    assert.deepEqual(await deliver(state.env, job), { acked: 0, retried: 1 });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(state.stored.size, 2);
  assert.ok(!state.operations.some(({ sql }) => sql.includes('INSERT INTO datasets')));
  assert.equal(state.statuses.get(job.id), 'failed');
});

test('cleanup keeps each scope own published version and any unpointed staging rows', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('../../migrations/0002_legislation_jobs.sql', import.meta.url), 'utf8'));
    const dataset = db.prepare('INSERT INTO datasets(scope,version,since,until,fetched_at,count,source_url,raw_key) VALUES(?,?,?,?,?,?,?,?)');
    const record = db.prepare('INSERT INTO records(scope,version,id,date,data) VALUES(?,?,?,?,?)');
    for (const [scope, version] of [['expenses:1', 'a'], ['expenses:2', 'b'], ['votes:1', 'c'], ['proposals:1', 'd']]) {
      dataset.run(scope, version, '2026-04-01', '2026-09-30', '2026-10-05', 1, 'https://www.camara.leg.br/', 'raw');
      record.run(scope, version, 'current', '2026-09-01', '{}');
      record.run(scope, 'old', 'stale', '2026-08-01', '{}');
    }
    record.run('expenses:3', 'unpublished', 'staged', '2026-09-01', '{}');
    db.exec(cleanupExpenseRecordsSql);
    db.exec(cleanupLegislationRecordsSql);
    const rows = db.prepare('SELECT scope,version,id FROM records ORDER BY scope').all().map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { scope: 'expenses:1', version: 'a', id: 'current' },
      { scope: 'expenses:2', version: 'b', id: 'current' },
      { scope: 'expenses:3', version: 'unpublished', id: 'staged' },
      { scope: 'proposals:1', version: 'd', id: 'current' },
      { scope: 'votes:1', version: 'c', id: 'current' },
    ]);
  } finally {
    db.close();
  }
});
