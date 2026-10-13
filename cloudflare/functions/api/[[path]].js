// Cloudflare Pages: /api/* goes to the Railway backend, same origin for the page (Netlify did this with
// _redirects; Pages can only rewrite to its own paths). Cookies, bodies and status pass through untouched.
const API = "https://api-production-3edf.up.railway.app";

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const target = (env.API_ORIGIN || API) + url.pathname + url.search;
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", "https");
  const init = { method: request.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;
  return fetch(target, init);
}
