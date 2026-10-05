import { buildPeriods } from '../../src/lib/data.ts';
import { normalizeLegacyDeputies, legacyDeputiesRequestUrl, legacyDeputiesUrl } from '../../src/lib/legacy.ts';
import { bulkExpensesUrl, normalizeBulkExpense, parseSemicolonCsv, unzipSingleCsv } from '../../src/lib/bulk.ts';
import { ingestLegislation, legislationUrl, type LegislationStreams } from '../../src/lib/legislation.ts';
import { officialUrl } from '../../src/lib/normalize.ts';

type SqlResult = { results: Record<string, unknown>[]; meta?: { changes?: number } };
type Statement = {
  bind(...values: unknown[]): Statement;
  run(): Promise<SqlResult>;
  all<T extends Record<string, unknown>>(): Promise<{ results: T[] }>;
};
type Db = { prepare(query: string): Statement; batch(statements: Statement[]): Promise<SqlResult[]> };
type RawBucket = { put(key: string, value: ArrayBuffer): Promise<unknown>; get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null> };
type Queue = { send(body: Job): Promise<unknown> };
export type Env = { DB: Db; RAW: RawBucket; INGEST_QUEUE: Queue };
type Job = { id: string; kind: 'catalog' | 'expenses-bulk' | 'legislation-bulk'; asOf: string };
type Message = { body: Job; ack(): void; retry(): void };
type MessageBatch = { messages: Message[] };

export const cleanupExpenseRecordsSql = "DELETE FROM records WHERE scope LIKE 'expenses:%' AND EXISTS (SELECT 1 FROM datasets WHERE datasets.scope=records.scope AND datasets.version<>records.version)";
export const cleanupLegislationRecordsSql = "DELETE FROM records WHERE (scope LIKE 'votes:%' OR scope LIKE 'proposals:%') AND EXISTS (SELECT 1 FROM datasets WHERE datasets.scope=records.scope AND datasets.version<>records.version)";

function day(instant: string): string { return instant.slice(0, 10); }

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchOfficial(url: string, maximumBytes: number, timeoutMs = 15_000): Promise<{ body: ArrayBuffer; finalUrl: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let current = url;
      for (let redirects = 0; redirects < 3; redirects++) {
        if (!officialUrl(current)) throw new TypeError('Destino fora da Câmara');
        const response = await fetch(current, { signal: controller.signal, redirect: 'manual', headers: { Accept: '*/*' } });
        if ([301, 302, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          const next = location ? new URL(location, current).toString() : null;
          if (!next || !officialUrl(next)) throw new TypeError('Redirecionamento externo');
          current = next;
          continue;
        }
        if (!response.ok) throw new Error(`Fonte oficial respondeu HTTP ${response.status}`);
        const length = Number(response.headers.get('content-length'));
        if (Number.isFinite(length) && length > maximumBytes) throw new TypeError('Resposta oficial excede limite');
        const body = await response.arrayBuffer();
        if (body.byteLength === 0 || body.byteLength > maximumBytes) throw new TypeError('Resposta oficial vazia ou excessiva');
        return { body, finalUrl: current };
      }
      throw new TypeError('Redirecionamentos excessivos');
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function archive(env: Env, kind: string, body: ArrayBuffer, suffix: string, fetchedAt: string): Promise<string> {
  const hash = await sha256(body);
  const key = `sources/${kind}/${fetchedAt.replace(/[:.]/g, '-')}-${hash}.${suffix}`;
  await env.RAW.put(key, body);
  return key;
}

async function enqueue(env: Env, job: Job): Promise<boolean> {
  const now = new Date().toISOString();
  const active = await env.DB.prepare("SELECT id,updated_at FROM ingestion_jobs WHERE kind=? AND status IN ('queued','running') LIMIT 1")
    .bind(job.kind).all<{ id: string; updated_at: string }>();
  const existing = active.results[0];
  if (existing) {
    if (Date.now() - Date.parse(existing.updated_at) < 2 * 60 * 60 * 1000) return false;
    await env.DB.prepare("UPDATE ingestion_jobs SET status='failed',updated_at=?,error=? WHERE id=? AND status IN ('queued','running') AND updated_at=?")
      .bind(now, 'Job expirou após duas horas.', existing.id, existing.updated_at).run();
  }
  const result = await env.DB.prepare(
    `INSERT INTO ingestion_jobs(id,kind,scope,status,updated_at,attempts,error)
     VALUES(?,?,?,'queued',?,0,NULL)
     ON CONFLICT(id) DO UPDATE SET status='queued',updated_at=excluded.updated_at,error=NULL
     WHERE ingestion_jobs.status='failed'`,
  ).bind(job.id, job.kind, job.kind === 'catalog' ? 'catalog' : job.kind === 'expenses-bulk' ? 'expenses' : 'legislation', now).run();
  if (!result.meta?.changes) return false;
  try {
    await env.INGEST_QUEUE.send(job);
    return true;
  } catch (error) {
    await env.DB.prepare("UPDATE ingestion_jobs SET status='failed',updated_at=?,error=? WHERE id=?")
      .bind(new Date().toISOString(), String(error).slice(0, 300), job.id).run();
    throw error;
  }
}

async function markRunning(env: Env, job: Job): Promise<boolean> {
  const row = await env.DB.prepare('SELECT status FROM ingestion_jobs WHERE id=?').bind(job.id).all<{ status: string }>();
  if (!row.results[0] || row.results[0].status === 'completed') return false;
  const newer = await env.DB.prepare("SELECT id FROM ingestion_jobs WHERE kind=? AND id>? AND status='completed' LIMIT 1")
    .bind(job.kind, job.id).all<{ id: string }>();
  if (newer.results.length) return false;
  const other = await env.DB.prepare("SELECT id FROM ingestion_jobs WHERE kind=? AND status IN ('queued','running') AND id<>? LIMIT 1")
    .bind(job.kind, job.id).all<{ id: string }>();
  if (other.results.length) return false;
  await env.DB.prepare("UPDATE ingestion_jobs SET status='running',attempts=attempts+1,updated_at=?,error=NULL WHERE id=?")
    .bind(new Date().toISOString(), job.id).run();
  return true;
}

async function assertCurrentJob(env: Env, job: Job): Promise<void> {
  const row = await env.DB.prepare('SELECT status FROM ingestion_jobs WHERE id=?').bind(job.id).all<{ status: string }>();
  if (row.results[0]?.status !== 'running') throw new TypeError('Job substituído por execução mais recente');
}

async function markDone(env: Env, job: Job): Promise<void> {
  await env.DB.prepare("UPDATE ingestion_jobs SET status='completed',updated_at=?,error=NULL WHERE id=?")
    .bind(new Date().toISOString(), job.id).run();
}

async function runCatalog(env: Env, job: Job): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const { body } = await fetchOfficial(legacyDeputiesRequestUrl, 5_000_000);
  const rawKey = await archive(env, 'deputies', body, 'xml', fetchedAt);
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(body);
  const deputies = normalizeLegacyDeputies(xml, fetchedAt);
  const version = `${job.id}:${fetchedAt}`;
  const period = buildPeriods(new Date(job.asOf))[0]!;
  const statements: Statement[] = [env.DB.prepare(
    `INSERT INTO deputies(id,data,source_url,fetched_at,catalog_version,active)
     SELECT json_extract(value,'$.id'),json(value),json_extract(value,'$.sourceUrl'),?, ?,1
     FROM json_each(?) WHERE 1
     ON CONFLICT(id) DO UPDATE SET data=excluded.data,source_url=excluded.source_url,
       fetched_at=excluded.fetched_at,catalog_version=excluded.catalog_version,active=1`,
  ).bind(fetchedAt, version, JSON.stringify(deputies))];
  statements.push(env.DB.prepare('UPDATE deputies SET active=0 WHERE catalog_version<>?').bind(version));
  statements.push(env.DB.prepare(
    `INSERT INTO datasets(scope,version,since,until,fetched_at,count,source_url,raw_key)
     VALUES('catalog',?,?,?,?,?,?,?)
     ON CONFLICT(scope) DO UPDATE SET version=excluded.version,since=excluded.since,
       until=excluded.until,fetched_at=excluded.fetched_at,count=excluded.count,
       source_url=excluded.source_url,raw_key=excluded.raw_key`,
  ).bind(version, period.start, period.end, fetchedAt, deputies.length, legacyDeputiesUrl, rawKey));
  await assertCurrentJob(env, job);
  await env.DB.batch(statements);
  await markDone(env, job);
  const followups = await Promise.allSettled([
    enqueue(env, { id: `expenses-bulk:${day(job.asOf)}`, kind: 'expenses-bulk', asOf: job.asOf }),
    enqueue(env, { id: `legislation-bulk:${day(job.asOf)}`, kind: 'legislation-bulk', asOf: job.asOf }),
  ]);
  for (const followup of followups) if (followup.status === 'rejected') console.error('Falha ao enfileirar atualização', followup.reason);
}

async function runExpensesBulk(env: Env, job: Job): Promise<void> {
  const { results: active } = await env.DB.prepare('SELECT id FROM deputies WHERE active=1').all<{ id: string }>();
  if (active.length === 0) throw new TypeError('Catálogo de deputados indisponível');
  const activeIds = new Set(active.map(({ id }) => id));
  const counts = new Map(active.map(({ id }) => [id, 0]));
  const period = buildPeriods(new Date(job.asOf))[0]!;
  const fetchedAt = new Date().toISOString();
  const version = `${job.id}:${fetchedAt}`;
  const rawKeys: string[] = [];
  const years = [...new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])];
  let staged: { scope: string; id: string; date: string; data: object }[] = [];
  let writeQueries = 0;
  const flush = async () => {
    if (!staged.length) return;
    if (writeQueries >= 35) throw new TypeError('Volume CEAP excede orçamento de consultas do Worker');
    await env.DB.prepare(
      `INSERT INTO records(scope,version,id,date,data)
       SELECT json_extract(value,'$.scope'),?,json_extract(value,'$.id'),
              json_extract(value,'$.date'),json_extract(value,'$.data')
       FROM json_each(?)`,
    ).bind(version, JSON.stringify(staged)).run();
    writeQueries += 1;
    staged = [];
  };
  for (const year of years) {
    const { body } = await fetchOfficial(bulkExpensesUrl(year), 20_000_000);
    rawKeys.push(await archive(env, `ceap/${year}`, body, 'zip', fetchedAt));
    for await (const { row, index } of parseSemicolonCsv(unzipSingleCsv(body))) {
      const normalized = normalizeBulkExpense(row, index);
      if (!normalized || !activeIds.has(normalized.deputyId)) continue;
      const { expense } = normalized;
      if (expense.date < period.start || expense.date > period.end) continue;
      const scope = `expenses:${normalized.deputyId}`;
      staged.push({ scope, id: expense.id, date: expense.date, data: expense });
      counts.set(normalized.deputyId, counts.get(normalized.deputyId)! + 1);
      if (staged.length >= 500) await flush();
    }
    await flush();
  }
  const datasetRows = active.map(({ id }) => ({ scope: `expenses:${id}`, count: counts.get(id)! }));
  await assertCurrentJob(env, job);
  await env.DB.prepare(
    `INSERT INTO datasets(scope,version,since,until,fetched_at,count,source_url,raw_key)
     SELECT json_extract(value,'$.scope'),?,?,?,?,json_extract(value,'$.count'),?,?
     FROM json_each(?) WHERE 1
     ON CONFLICT(scope) DO UPDATE SET version=excluded.version,since=excluded.since,
       until=excluded.until,fetched_at=excluded.fetched_at,count=excluded.count,
       source_url=excluded.source_url,raw_key=excluded.raw_key`,
  ).bind(version, period.start, period.end, fetchedAt, bulkExpensesUrl(years.at(-1)!), JSON.stringify(rawKeys), JSON.stringify(datasetRows)).run();
  await markDone(env, job);
  try {
    await env.DB.prepare(cleanupExpenseRecordsSql).run();
  } catch (error) {
    console.error('Falha na limpeza de versões antigas da CEAP', error);
  }
}

type RawSource = { sourceUrl: string; key: string };

function lazyCsvStream(env: Env, sourceUrl: string, sourceKind: string, fetchedAt: string, sources: RawSource[]): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!reader) {
        const { body } = await fetchOfficial(sourceUrl, 60_000_000, 60_000);
        const key = await archive(env, sourceKind, body, 'csv', fetchedAt);
        const stored = await env.RAW.get(key);
        if (!stored?.body) throw new TypeError('Arquivo bruto não encontrado após arquivamento');
        sources.push({ sourceUrl, key });
        reader = stored.body.getReader();
      }
      const next = await reader.read();
      if (next.done) {
        reader.releaseLock();
        reader = null;
        controller.close();
      } else {
        controller.enqueue(next.value);
      }
    },
    async cancel() { await reader?.cancel(); },
  }, { highWaterMark: 0 });
}

async function runLegislationBulk(env: Env, job: Job): Promise<void> {
  const { results: active } = await env.DB.prepare('SELECT id FROM deputies WHERE active=1').all<{ id: string }>();
  if (active.length === 0) throw new TypeError('Catálogo de deputados indisponível');
  const deputyIds = new Set(active.map(({ id }) => id));
  const period = buildPeriods(new Date(job.asOf))[0]!;
  const years = [...new Set([Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))])];
  const fetchedAt = new Date().toISOString();
  const version = `${job.id}:${fetchedAt}`;
  const sources: RawSource[] = [];
  const counts = new Map<string, number>();
  const seen = new Map<string, string>();
  const staged: { scope: string; id: string; date: string; data: object }[] = [];
  let writeQueries = 0;
  const flush = async () => {
    if (!staged.length) return;
    if (writeQueries >= 10) throw new TypeError('Volume legislativo excede orçamento de consultas do Worker');
    await env.DB.prepare(
      `INSERT INTO records(scope,version,id,date,data)
       SELECT json_extract(value,'$.scope'),?,json_extract(value,'$.id'),
              json_extract(value,'$.date'),json_extract(value,'$.data')
       FROM json_each(?)`,
    ).bind(version, JSON.stringify(staged)).run();
    staged.length = 0;
    writeQueries += 1;
  };
  const add = async (scope: string, record: { id: string; date: string }) => {
    const key = `${scope}:${record.id}`;
    const data = JSON.stringify(record);
    const previous = seen.get(key);
    if (previous && previous !== data) throw new TypeError(`Registro legislativo conflitante: ${key}`);
    if (previous) return;
    seen.set(key, data);
    staged.push({ scope, id: record.id, date: record.date, data: record });
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
    if (staged.length >= 1000) await flush();
  };
  for (const year of years) {
    const stream = (kind: Parameters<typeof legislationUrl>[0]) => lazyCsvStream(env, legislationUrl(kind, year), `${kind}/${year}`, fetchedAt, sources);
    const streams: LegislationStreams = {
      votations: stream('votacoes'),
      votes: stream('votacoesVotos'),
      affected: stream('votacoesProposicoes'),
      proposals: stream('proposicoes'),
      authors: stream('proposicoesAutores'),
    };
    const result = await ingestLegislation(streams, deputyIds, period);
    for (const [id, votes] of result.votes) for (const vote of votes) await add(`votes:${id}`, vote);
    for (const [id, proposals] of result.proposals) for (const proposal of proposals) await add(`proposals:${id}`, proposal);
    await flush();
  }
  if (sources.length !== years.length * 5) throw new TypeError('Arquivos legislativos incompletos');
  await assertCurrentJob(env, job);
  const datasetRows = active.flatMap(({ id }) => [
    { scope: `votes:${id}`, count: counts.get(`votes:${id}`) ?? 0, sourceUrl: legislationUrl('votacoesVotos', years.at(-1)!) },
    { scope: `proposals:${id}`, count: counts.get(`proposals:${id}`) ?? 0, sourceUrl: legislationUrl('proposicoes', years.at(-1)!) },
  ]);
  await env.DB.prepare(
    `INSERT INTO datasets(scope,version,since,until,fetched_at,count,source_url,raw_key)
     SELECT json_extract(value,'$.scope'),?,?,?,?,json_extract(value,'$.count'),
            json_extract(value,'$.sourceUrl'),?
     FROM json_each(?) WHERE 1
     ON CONFLICT(scope) DO UPDATE SET version=excluded.version,since=excluded.since,
       until=excluded.until,fetched_at=excluded.fetched_at,count=excluded.count,
       source_url=excluded.source_url,raw_key=excluded.raw_key`,
  ).bind(version, period.start, period.end, fetchedAt, JSON.stringify(sources), JSON.stringify(datasetRows)).run();
  await markDone(env, job);
  try {
    await env.DB.prepare(cleanupLegislationRecordsSql).run();
  } catch (error) {
    console.error('Falha na limpeza de versões legislativas antigas', error);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ ok: true, service: 'lume-collector' });
    return new Response('Not found', { status: 404 });
  },
  async scheduled(controller: { scheduledTime: number }, env: Env): Promise<void> {
    const asOf = new Date(controller.scheduledTime).toISOString();
    await enqueue(env, { id: `catalog:${day(asOf)}`, kind: 'catalog', asOf });
  },
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body;
      if (!job || !['catalog', 'expenses-bulk', 'legislation-bulk'].includes(job.kind)) { message.ack(); continue; }
      try {
        if (!await markRunning(env, job)) { message.ack(); continue; }
        if (job.kind === 'catalog') await runCatalog(env, job);
        else if (job.kind === 'expenses-bulk') await runExpensesBulk(env, job);
        else await runLegislationBulk(env, job);
        message.ack();
      } catch (error) {
        await env.DB.prepare("UPDATE ingestion_jobs SET status='failed',updated_at=?,error=? WHERE id=?")
          .bind(new Date().toISOString(), String(error).slice(0, 300), job.id).run();
        message.retry();
      }
    }
  },
};
