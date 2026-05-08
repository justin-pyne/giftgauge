import client from 'prom-client';

/**
 * Prometheus registry for this service. We use a dedicated Registry rather
 * than the global one so each service's /metrics output is clean and
 * predictable when scraped.
 */
export const registry = new client.Registry();

// Standard process / runtime metrics: open FDs, GC, event loop lag, etc.
client.collectDefaultMetrics({ register: registry });

// ---------- Generic HTTP metrics (used by middleware in routes.ts) ----------

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests processed.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  // A reasonable default bucketing for an API serving sub-second requests.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP responses with status >= 500.',
  labelNames: ['method', 'route'],
  registers: [registry],
});

// ---------- Service-specific metric ----------------------------------------

export const profilesCreatedTotal = new client.Counter({
  name: 'profile_service_profiles_created_total',
  help: 'Total profiles created.',
  registers: [registry],
});
