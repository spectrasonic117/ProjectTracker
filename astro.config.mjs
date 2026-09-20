// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// En GitHub Pages el sitio vive en https://<owner>.github.io/<repo>/; el workflow
// de despliegue define PAGES_SITE y PAGES_BASE_PATH. En local se sirve en la raíz.
const site = process.env.PAGES_SITE ?? 'http://localhost:4321';
const base = process.env.PAGES_BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'never',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
