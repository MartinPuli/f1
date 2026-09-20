import { defineConfig, loadEnv } from 'vite';
import { localArchive } from './server/local-archive.js';
import { api } from './server/api.js';
export default defineConfig(({ mode }) => ({
  build: {
    outDir: 'dist/client',
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      input: { race: 'index.html', championship: 'championship.html' },
      output: { manualChunks: { three: ['three', 'three/addons/controls/OrbitControls.js'] } },
    },
  },
  plugins: [
    {
      name: 'jev-api',
      configureServer(server) {
        const env = {
          ...loadEnv(mode, process.cwd(), ''),
          LOCAL_OWNER: 'local',
          LOCAL_ARCHIVE: localArchive,
        };
        server.middlewares.use('/api', async (req, res) => {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const url = `http://${req.headers.host}/api${req.url}`;
          const request = new Request(url, {
            method: req.method,
            headers: req.headers,
            ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
          });
          const result = await api(request, env);
          res.statusCode = result.status;
          result.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await result.text());
        });
      },
    },
  ],
}));
