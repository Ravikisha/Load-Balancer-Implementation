import client from 'prom-client';

const register = new client.Registry();

// Default metrics (Node.js process-related)
client.collectDefaultMetrics({ register });

// Define custom metrics
export const requestCount = new client.Counter({
  name: 'load_balancer_requests_total',
  help: 'Total number of requests received by the load balancer',
  labelNames: ['target'],
});

export const activeConnections = new client.Gauge({
  name: 'load_balancer_active_connections',
  help: 'Current number of active connections to each target server',
  labelNames: ['target'],
});

export const serverHealth = new client.Gauge({
  name: 'load_balancer_server_health',
  help: 'Health status of each backend server (1 = healthy, 0 = down)',
  labelNames: ['target'],
});

// Expose a function to get the current metrics
export const getMetrics = async () => {
  return await register.metrics();
};

export { register };
