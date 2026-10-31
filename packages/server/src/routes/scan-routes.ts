/**
 * REST API routes for scan management.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ScanManager, ScanNotFoundError } from '../scan-manager.js';

/** Zod schema for POST /api/scans body. */
const createScanSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  options: z
    .object({
      maxConcurrency: z.number().int().min(1).max(200).optional(),
      maxConcurrencyPerHost: z.number().int().min(1).max(100).optional(),
      requestTimeout: z.number().int().min(1000).max(60000).optional(),
      followRedirects: z.boolean().optional(),
      maxRedirects: z.number().int().min(0).max(20).optional(),
      respectRobotsTxt: z.boolean().optional(),
      checkExternalLinks: z.boolean().optional(),
      userAgent: z.string().optional(),
      maxPages: z.number().int().min(0).optional(),
    })
    .optional(),
});

/** Zod schema for GET /api/scans/:scanId/results query params. */
const resultsQuerySchema = z.object({
  broken: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(1).max(100000))
    .optional()
    .default('1000'),
  errorType: z.string().optional(),
  statusCode: z
    .string()
    .transform(Number)
    .pipe(z.number().int())
    .optional(),
});

export function registerScanRoutes(app: FastifyInstance, manager: ScanManager): void {
  /**
   * POST /api/scans — Create and start a new scan.
   */
  app.post('/api/scans', async (request, reply) => {
    const parsed = createScanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { url, options } = parsed.data;
    const scanConfig = { targetUrl: url, ...options };

    try {
      const scanId = manager.createScan(scanConfig);
      manager.startScan(scanId);
      return reply.status(201).send({ scanId, status: 'started' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ error: 'Failed to start scan', message });
    }
  });

  /**
   * GET /api/scans — List all scans.
   */
  app.get('/api/scans', async (_request, reply) => {
    const scans = manager.listScans();
    return reply.send(scans);
  });

  /**
   * GET /api/scans/:scanId — Get scan progress and summary.
   */
  app.get<{ Params: { scanId: string } }>('/api/scans/:scanId', async (request, reply) => {
    try {
      const state = manager.getScan(request.params.scanId);
      if (!state) {
        return reply.status(404).send({ error: `Scan not found: ${request.params.scanId}` });
      }

      return reply.send({
        scanId: state.scanId,
        progress: state.progress,
        summary: {
          totalResults: state.results.length,
          brokenLinks: state.results.filter((r) => r.isBroken).length,
          okLinks: state.results.filter((r) => !r.isBroken).length,
        },
        createdAt: state.createdAt,
      });
    } catch (err) {
      return handleScanError(err, reply);
    }
  });

  /**
   * GET /api/scans/:scanId/results — Get filtered, paginated results.
   */
  app.get<{ Params: { scanId: string }; Querystring: Record<string, string> }>(
    '/api/scans/:scanId/results',
    async (request, reply) => {
      const qParsed = resultsQuerySchema.safeParse(request.query);
      if (!qParsed.success) {
        return reply.status(400).send({
          error: 'Invalid query parameters',
          details: qParsed.error.flatten().fieldErrors,
        });
      }

      const { broken, page, limit, errorType, statusCode } = qParsed.data;

      try {
        const results = manager.getResults(request.params.scanId, {
          broken,
          errorType,
          statusCode,
        });

        const total = results.length;
        const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
        const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
        const start = (pageNum - 1) * limitNum;
        const paginatedResults = results.slice(start, start + limitNum);

        return reply.send({
          results: paginatedResults,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        });
      } catch (err) {
        return handleScanError(err, reply);
      }
    },
  );

  /**
   * DELETE /api/scans/:scanId — Stop and remove a scan.
   */
  app.delete<{ Params: { scanId: string } }>('/api/scans/:scanId', async (request, reply) => {
    try {
      manager.removeScan(request.params.scanId);
      return reply.status(204).send();
    } catch (err) {
      return handleScanError(err, reply);
    }
  });

  /**
   * POST /api/scans/:scanId/stop — Stop a scan without deleting it.
   */
  app.post<{ Params: { scanId: string } }>(
    '/api/scans/:scanId/stop',
    async (request, reply) => {
      try {
        manager.stopScan(request.params.scanId);
        return reply.send({ status: 'completed' });
      } catch (err) {
        return handleScanError(err, reply);
      }
    },
  );

  /**
   * POST /api/scans/:scanId/pause — Pause a running scan.
   */
  app.post<{ Params: { scanId: string } }>(
    '/api/scans/:scanId/pause',
    async (request, reply) => {
      try {
        manager.pauseScan(request.params.scanId);
        return reply.send({ status: 'paused' });
      } catch (err) {
        return handleScanError(err, reply);
      }
    },
  );

  /**
   * POST /api/scans/:scanId/resume — Resume a paused scan.
   */
  app.post<{ Params: { scanId: string } }>(
    '/api/scans/:scanId/resume',
    async (request, reply) => {
      try {
        manager.resumeScan(request.params.scanId);
        return reply.send({ status: 'resumed' });
      } catch (err) {
        return handleScanError(err, reply);
      }
    },
  );

  /**
   * GET /api/scans/:scanId/export/csv — Download results as CSV.
   */
  app.get<{ Params: { scanId: string }; Querystring: Record<string, string> }>(
    '/api/scans/:scanId/export/csv',
    async (request, reply) => {
      try {
        const broken =
          request.query.broken !== undefined ? request.query.broken === 'true' : undefined;
        const statusCode =
          request.query.statusCode !== undefined ? Number(request.query.statusCode) : undefined;
        const errorType = request.query.errorType;

        const csv = manager.exportCsv(request.params.scanId, {
          broken,
          statusCode,
          errorType,
        });

        const suffix = broken ? '-broken' : '';
        return reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="scan-${request.params.scanId}${suffix}.csv"`,
          )
          .send(csv);
      } catch (err) {
        return handleScanError(err, reply);
      }
    },
  );

  /**
   * GET /api/scans/:scanId/export/json — Download results as JSON.
   */
  app.get<{ Params: { scanId: string }; Querystring: Record<string, string> }>(
    '/api/scans/:scanId/export/json',
    async (request, reply) => {
      try {
        const broken =
          request.query.broken !== undefined ? request.query.broken === 'true' : undefined;
        const statusCode =
          request.query.statusCode !== undefined ? Number(request.query.statusCode) : undefined;
        const errorType = request.query.errorType;

        const json = manager.exportJson(request.params.scanId, {
          broken,
          statusCode,
          errorType,
        });

        const suffix = broken ? '-broken' : '';
        return reply
          .header('Content-Type', 'application/json; charset=utf-8')
          .header(
            'Content-Disposition',
            `attachment; filename="scan-${request.params.scanId}${suffix}.json"`,
          )
          .send(json);
      } catch (err) {
        return handleScanError(err, reply);
      }
    },
  );
}

/** Centralized error handler for scan operations. */
function handleScanError(err: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  if (err instanceof ScanNotFoundError) {
    return reply.status(404).send({ error: err.message });
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return reply.status(500).send({ error: 'Internal server error', message });
}
