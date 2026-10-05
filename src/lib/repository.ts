import type { Deputy, DataCoverage, Period } from './data';

type Dataset = { scope: string; version: string; since: string; until: string; fetched_at: string; count: number; source_url: string };
type StoredRecord = { data: string };

export async function listDeputies(db: D1Database): Promise<Deputy[]> {
  const result = await db.prepare('SELECT data FROM deputies WHERE active = 1 ORDER BY id').all<StoredRecord>();
  return result.results.map(row => {
    const deputy = JSON.parse(row.data) as Deputy;
    return { ...deputy, photo: `/foto/${deputy.id}.jpg` };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function getDeputy(db: D1Database, id: string): Promise<Deputy | null> {
  if (!/^\d{1,9}$/.test(id)) return null;
  const row = await db.prepare('SELECT data FROM deputies WHERE id = ? AND active = 1').bind(id).first<StoredRecord>();
  if (!row) return null;
  const deputy = JSON.parse(row.data) as Deputy;
  deputy.photo = `/foto/${deputy.id}.jpg`;
  for (const kind of ['expenses', 'votes', 'proposals', 'amendments'] as const) {
    const dataset = await db.prepare('SELECT * FROM datasets WHERE scope = ?').bind(`${kind}:${id}`).first<Dataset>();
    if (!dataset) continue;
    const records = await db.prepare('SELECT data FROM records WHERE scope = ? AND version = ? ORDER BY date DESC, id').bind(dataset.scope, dataset.version).all<StoredRecord>();
    if (records.results.length !== dataset.count) throw new Error(`Snapshot incompleto: ${dataset.scope}`);
    deputy.coverage[kind] = { status: 'complete', since: dataset.since, until: dataset.until, fetchedAt: dataset.fetched_at, sourceUrl: dataset.source_url };
    Object.assign(deputy, { [kind]: records.results.map(record => JSON.parse(record.data)) });
  }
  return deputy;
}

export type ExpenseSummary = { totalCents: number; count: number; missingCount: number; coverage: DataCoverage };

export async function expenseSummaries(db: D1Database, period: Period): Promise<Map<string, ExpenseSummary>> {
  const datasets = await db.prepare("SELECT * FROM datasets WHERE scope LIKE 'expenses:%'").all<Dataset>();
  const totals = await db.prepare(`SELECT r.scope, COUNT(*) AS count,
    COALESCE(SUM(json_extract(r.data, '$.amountCents')), 0) AS total,
    SUM(CASE WHEN json_extract(r.data, '$.amountCents') IS NULL THEN 1 ELSE 0 END) AS missing
    FROM records r JOIN datasets d ON d.scope = r.scope AND d.version = r.version
    WHERE r.scope LIKE 'expenses:%' AND r.date >= ? AND r.date <= ? GROUP BY r.scope`).bind(period.start, period.end).all<{ scope: string; count: number; total: number; missing: number }>();
  const byScope = new Map(totals.results.map(row => [row.scope, row]));
  return new Map(datasets.results.filter(dataset => dataset.since <= period.start && dataset.until >= period.end).map(dataset => {
    const total = byScope.get(dataset.scope);
    return [dataset.scope.slice('expenses:'.length), {
      totalCents: total?.total ?? 0, count: total?.count ?? 0, missingCount: total?.missing ?? 0,
      coverage: { status: 'complete', since: dataset.since, until: dataset.until, fetchedAt: dataset.fetched_at, sourceUrl: dataset.source_url },
    }];
  }));
}
