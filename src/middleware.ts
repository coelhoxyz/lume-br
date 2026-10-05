import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

export const onRequest = defineMiddleware(async (context, next) => {
  const html = context.url.pathname === '/' || context.url.pathname === '/sobre/' || /^\/deputado\/\d+\/$/.test(context.url.pathname);
  const portrait = /^\/foto\/\d+\.jpg$/.test(context.url.pathname);
  if (context.request.method !== 'GET' || (!html && !portrait)) return next();
  const cache = (caches as CacheStorage & { default?: Cache }).default;
  const keyUrl = new URL(context.url.pathname, context.url.origin);
  keyUrl.searchParams.set('version', env.VERSION?.id ?? 'local');
  const key = new Request(keyUrl);
  const cached = await cache?.match(key);
  if (cached) return cached;
  const response = await next();
  if (response.status === 200) {
    if (html) response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=900');
    if (cache) context.locals.cfContext.waitUntil(cache.put(key, response.clone()));
  }
  return response;
});
