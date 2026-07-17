import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    env: {
      BASE_URL: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml',
    },
  },
});
