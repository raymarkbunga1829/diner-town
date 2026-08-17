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
    host: true,
    port: 5173,
  },
});
