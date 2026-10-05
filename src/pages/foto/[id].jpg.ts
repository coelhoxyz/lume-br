import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params }) => {
  if (!/^\d{1,9}$/.test(params.id ?? '')) return new Response('Not found', { status: 404 });
  const object = await env.RAW.get(`portraits/${params.id}.jpg`);
  if (!object) return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"><rect width="400" height="500" fill="#e7e4f2"/><circle cx="200" cy="175" r="70" fill="#aca5c6"/><path d="M60 450v-60a140 140 0 0 1 280 0v60" fill="#aca5c6"/></svg>', { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' } });
  return new Response(await object.arrayBuffer(), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', ETag: object.httpEtag, 'X-Content-Type-Options': 'nosniff' } });
};
