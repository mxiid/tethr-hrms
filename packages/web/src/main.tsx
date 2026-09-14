import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';

import * as Sentry from '@sentry/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './app/global.css';

// Error + performance monitoring. A Sentry DSN is a public browser key, not a
// secret; the env var lets each environment point at its own project. Full
// sampling in dev, a slice in production where every transaction costs quota.
Sentry.init({
  dsn:
    import.meta.env.VITE_SENTRY_DSN ??
    'https://a81ecb8f0ca7fc66debc6e4cd095f972@o4512083621380096.ingest.de.sentry.io/4512083636453456',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  tracePropagationTargets: ['localhost', import.meta.env.VITE_GRAPHQL_URL].filter(
    (target): target is string => typeof target === 'string',
  ),
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
