import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

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
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP responses with status >= 500.',
  labelNames: ['method', 'route'],
  registers: [registry],
});

// Service-specific
export const submissionsTotal = new client.Counter({
  name: 'sharing_service_submissions_total',
  help: 'Total gift idea submissions accepted.',
  registers: [registry],
});

export const shareLookupsTotal = new client.Counter({
  name: 'sharing_service_share_lookups_total',
  help: 'Total share-code lookups, labeled by validity.',
  labelNames: ['valid'],
  registers: [registry],
});
