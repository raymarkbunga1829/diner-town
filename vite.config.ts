import { defineConfig } from 'vite';

// `base` is overridable so the same build works from a domain root or from a
// GitHub Pages project subpath (https://user.github.io/<repo>/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 4173),
    strictPort: true,
  },
});
