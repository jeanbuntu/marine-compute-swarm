/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import { connection, reason } from './server/muse';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  return {
  plugins: [react(), { name: 'muse-api', configureServer(server) {
    server.middlewares.use('/api/muse', async (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if(req.method==='GET'){res.end(JSON.stringify(connection(env)));return;}
      if(req.method!=='POST'){res.statusCode=405;res.end();return;}
      try {
        let text=''; for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>64000){res.statusCode=413;res.end();return;}}
        const result=await reason(JSON.parse(text),req.headers.authorization,env);
        res.statusCode=result.status;res.end(JSON.stringify(result.body));
      } catch {res.statusCode=400;res.end(JSON.stringify({error:'Invalid JSON request.'}));}
    });
  } }],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.ts'] },
};
});
