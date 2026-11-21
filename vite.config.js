import { defineConfig, loadEnv } from "vite";

// Dev bridge: /api/<name> -> api/<name>.js default export handler(req: Request): Promise<Response>.
// Vercel calls the same modules in production, so behaviour matches.
function apiBridge() {
  return {
    name: "psychoai-api-bridge",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const m = url.pathname.match(/^\/api\/([\w-]+)\/?$/);
        if (!m) return next();
        let mod;
        try {
          mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
        } catch (e) {
          if (/Failed to load url|does not exist/i.test(String(e?.message))) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: "not-found" }));
          }
          console.error(e);
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: "module-load" }));
        }
        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
          const request = new Request(new URL(req.url, `http://${req.headers.host || "localhost"}`), {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
          });
          // Same contract as Vercel: named HTTP-method exports (GET/POST) are Web handlers.
          const fn = mod[req.method] || mod.handler;
          const response = fn
            ? await fn(request)
            : new Response(JSON.stringify({ error: "method-not-allowed" }), { status: 405, headers: { "content-type": "application/json" } });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "handler" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-only secrets (GEMINI_API_KEY) go to process.env for api/*.js; never exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  return {
    plugins: [apiBridge()],
    test: { environment: "node" },
  };
});
