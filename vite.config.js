import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

const portFilePlugin = () => ({
  name: 'write-port-file',
  configureServer(server) {
    const writePort = () => {
      const addr = server.httpServer?.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      if (port) writeFileSync('.port', String(port));
    };
    server.httpServer?.once('listening', writePort);
    server.httpServer?.on('listening', writePort);
  },
});

export default defineConfig({
  plugins: [vue(), portFilePlugin()],
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: parseInt(process.env.DEV_PORT || '5174', 10),
    strictPort: false,
  },
});
