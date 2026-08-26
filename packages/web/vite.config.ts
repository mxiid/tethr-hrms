import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Consume internal packages from source — Vite compiles TS natively, which
      // avoids fragile CommonJS named-export interop with their built dist. tsc
      // still type-checks against the packages' published .d.ts.
      '@hrms/ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
      '@hrms/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      // shadcn/ui primitives for the finance module (scoped experiment).
      // Declared BEFORE '@' — alias entries match in order, and '@' would
      // otherwise swallow '@/components/…' into src/modules/components.
      '@/components': fileURLToPath(new URL('./src/finance-ui/components', import.meta.url)),
      '@/lib': fileURLToPath(new URL('./src/finance-ui/lib', import.meta.url)),
      '@': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
