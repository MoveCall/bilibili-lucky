import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createAppProxyPayload } from './server/appProxy.js';

function biliProxyDevPlugin() {
  return {
    name: 'bili-proxy-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const requestUrl = new URL(req.url, 'http://localhost');
        if (requestUrl.pathname !== '/api/proxy') {
          next();
          return;
        }

        const payload = await createAppProxyPayload(Object.fromEntries(requestUrl.searchParams.entries()));
        res.statusCode = payload.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload.body));
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.BILIBILI_COOKIE = env.BILIBILI_COOKIE || process.env.BILIBILI_COOKIE;

  return {
    plugins: [react(), biliProxyDevPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  };
});
