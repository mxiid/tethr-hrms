// Tailwind config for the PDF templates only. The compiled stylesheet is
// committed as `src/core/pdf/pdf-styles.generated.ts` by
// `npm run build:pdf-styles`, so PDF rendering never fetches a CDN.
module.exports = {
  purge: {
    enabled: true,
    content: [
      './src/modules/finance/payroll/pdf/**/*.tsx',
      './src/modules/finance/billing/pdf/**/*.tsx',
    ],
  },
  theme: { extend: {} },
  variants: {},
  plugins: [],
};
