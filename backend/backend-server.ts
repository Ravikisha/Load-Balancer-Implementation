import express from 'express';
import rateLimit from 'express-rate-limit';
import { IncomingMessage, Server, ServerResponse } from 'http';
import client from 'prom-client';

const responseString = 'Hello from backend Server';

export interface IBackendServer {
  PORT: number;
  server: Server<typeof IncomingMessage, typeof ServerResponse>;

  getServer(): Server<typeof IncomingMessage, typeof ServerResponse>;
  close(): Server<typeof IncomingMessage, typeof ServerResponse>;
}

export class BackendServer implements IBackendServer {
  PORT: number;
  server: Server<typeof IncomingMessage, typeof ServerResponse>;

  constructor(port: number) {
    this.PORT = port;

    const app = this.createExpressApp();
    const server = app.listen(port, () => {
      console.log('Backend Server listening on port ' + this.PORT);
    });

    this.server = server;
  }

  public getServer(): Server<typeof IncomingMessage, typeof ServerResponse> {
    return this.server;
  }

  public close(): Server<typeof IncomingMessage, typeof ServerResponse> {
    const server = this.server.close();
    console.log(`Closed Backend Server with port ${this.PORT}`);
    return server;
  }

  private createExpressApp() {
    const app = express();

    // Setup Prometheus registry
    const register = new client.Registry();
    client.collectDefaultMetrics({ register });

    // Custom metrics
    const activeConnections = new client.Gauge({
      name: 'active_connections',
      help: 'Number of active HTTP connections',
      registers: [register],
    });

    const requestCount = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [register],
    });

    const requestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5],
      registers: [register],
    });

    const errorCount = new client.Counter({
      name: 'errors_total',
      help: 'Total number of error responses (4xx or 5xx)',
      labelNames: ['route', 'status_code'],
      registers: [register],
    });

    // Track connections
    app.use((req, res, next) => {
      activeConnections.inc();
      const end = requestDuration.startTimer({ method: req.method, route: req.path });

      res.on('finish', () => {
        activeConnections.dec();
        requestCount.inc({ method: req.method, route: req.path, status_code: res.statusCode });
        end();

        if (res.statusCode >= 400) {
          errorCount.inc({ route: req.path, status_code: res.statusCode });
        }
      });

      next();
    });

    // /metrics endpoint
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (ex) {
        res.status(500).end(ex);
      }
    });

    // Basic security and rate limiting
    app.set('trust proxy', false);

    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 50,
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });

    app.use(limiter);
    app.use(express.text());
    app.use(express.json());

    // Routes
    app.get('/ping', (req, res) => {
      res.sendStatus(200);
    });

    app.get('/', (req, res) => {
      res.status(200).send(`[${req.hostname}:${this.PORT}] ${responseString}`);
    });

    return app;
  }
}
