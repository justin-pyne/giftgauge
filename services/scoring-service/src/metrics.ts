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

// AI-specific metrics
export const aiRequestsTotal = new client.Counter({
  name: 'scoring_service_ai_requests_total',
  help: 'Total AI scoring requests, labeled by mode and outcome.',
  labelNames: ['mode', 'outcome'], // outcome = success | fallback | error
  registers: [registry],
});

export const aiRequestDurationSeconds = new client.Histogram({
  name: 'scoring_service_ai_request_duration_seconds',
  help: 'AI scoring request duration in seconds.',
  labelNames: ['mode'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});
