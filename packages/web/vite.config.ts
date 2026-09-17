import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Consume internal packages from source — Vite compiles TS natively, which
      // avoids fragile CommonJS named-export interop with their built dist. tsc
      // still type-checks against the packages' published .d.ts.
      '@hrms/ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
      '@hrms/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
