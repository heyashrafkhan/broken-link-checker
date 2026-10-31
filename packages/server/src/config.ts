/**
 * Environment configuration for the server.
 * All values are read from environment variables with sensible defaults.
 */
export const config = {
  /** Port to listen on. */
  port: parseInt(process.env.PORT || '3001', 10),
  /** Host to bind to. */
  host: process.env.HOST || '0.0.0.0',
  /** Redis connection URL. */
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  /** Allowed CORS origin(s). */
  corsOrigin: process.env.CORS_ORIGIN || '*',
  /** Whether to connect to Redis (default false for easy local dev). */
  useRedis: process.env.USE_REDIS === 'true',
} as const;
