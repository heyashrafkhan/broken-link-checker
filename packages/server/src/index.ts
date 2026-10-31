/**
 * API Server entry point.
 * Initializes Fastify, CORS, WebSockets, Redis (optional), and registers routes.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import pino from 'pino';
import { config } from './config.js';
import { ScanManager } from './scan-manager.js';
import { registerScanRoutes } from './routes/scan-routes.js';
import { registerStreamRoutes } from './routes/stream-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({
  name: 'server',
  level: process.env.LOG_LEVEL || 'info',
});

async function main() {
  const app = Fastify({
    logger: true,
  });

  // Allow empty bodies with Content-Type: application/json without throwing 400
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      if (!body || body.toString().trim() === '') {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body.toString()));
      } catch (err: any) {
        done(err, undefined);
      }
    },
  );

  // Enable CORS
  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Enable WebSocket support
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Redis client (optional)
  let redis: Redis | undefined;
  if (config.useRedis) {
    try {
      redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 500, 2000);
        },
      });
      redis.on('error', (err) => {
        logger.warn({ err: err.message }, 'Redis connection issue, fallback to in-memory');
      });
      await redis.ping();
      logger.info('Connected to Redis');
    } catch (err) {
      logger.warn('Redis unavailable, proceeding with in-memory deduplication');
      redis = undefined;
    }
  }

  const scanManager = new ScanManager(redis);

  // Health check endpoint
  app.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    redis: Boolean(redis),
  }));

  // Register REST and real-time streaming routes
  registerScanRoutes(app, scanManager);
  registerStreamRoutes(app, scanManager);

  // Serve compiled dashboard static assets if present (All-in-One deployment)
  const candidateStaticPaths = [
    path.resolve(__dirname, '../../dashboard/dist'),
    path.resolve(process.cwd(), 'packages/dashboard/dist'),
    path.resolve(process.cwd(), 'public'),
  ];
  const staticPath = candidateStaticPaths.find((p) => fs.existsSync(p));

  if (staticPath) {
    await app.register(fastifyStatic, {
      root: staticPath,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      // API routes should return 404 JSON, not HTML
      if (
        request.url.startsWith('/api') ||
        request.url.startsWith('/ws') ||
        request.url.startsWith('/health')
      ) {
        return reply.status(404).send({ error: `Not found: ${request.url}` });
      }
      return reply.sendFile('index.html');
    });

    logger.info(`Serving dashboard frontend from: ${staticPath}`);
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down server...');
    try {
      if (redis) {
        await redis.quit().catch(() => {});
      }
      await app.close();
      logger.info('Server gracefully closed');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Broken Link Scanner API server running on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
