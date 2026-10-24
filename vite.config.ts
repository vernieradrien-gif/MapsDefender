import { defineConfig } from 'vitest/config';

// Base des chemins : "./" (relatif) en local et pour Capacitor plus tard ;
// le workflow GitHub Pages fournit BASE_PATH=/<nom-du-dépôt>/.
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
