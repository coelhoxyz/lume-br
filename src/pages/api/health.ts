import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async () => {
  try {
    const catalog = await env.DB.prepare("SELECT fetched_at, count FROM datasets WHERE scope = 'catalog'").first<{ fetched_at: string; count: number }>();
    const snapshots = await env.DB.prepare("SELECT substr(scope, 1, instr(scope, ':') - 1) AS kind, COUNT(*) AS profiles, MIN(fetched_at) AS fetchedAt FROM datasets WHERE scope <> 'catalog' GROUP BY kind").all();
    return Response.json({ ok: Boolean(catalog?.count), commit: env.RELEASE_COMMIT, version: env.VERSION.id, catalog, datasets: snapshots.results }, { status: catalog?.count ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, error: 'Banco de dados indisponível' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
