/**
 * Real-time streaming routes for scan progress and link results.
 * Supports both Server-Sent Events (SSE) and WebSockets.
 */

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { ScanManager } from '../scan-manager.js';
import type { ScanProgress, LinkResult } from '@blc/crawler';

export function registerStreamRoutes(app: FastifyInstance, manager: ScanManager): void {
  /**
   * GET /api/scans/:scanId/stream — Server-Sent Events (SSE) stream.
   *
   * Streams live progress, newly checked links, and completion events.
   */
  app.get<{ Params: { scanId: string } }>(
    '/api/scans/:scanId/stream',
    async (request, reply) => {
      const { scanId } = request.params;
      const state = manager.getScan(scanId);

      if (!state) {
        return reply.status(404).send({ error: `Scan not found: ${scanId}` });
      }

      // Configure SSE response headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial progress immediately
      reply.raw.write(
        `event: progress\ndata: ${JSON.stringify(state.progress)}\n\n`,
      );

      // Event handlers
      const onProgress = (event: { scanId: string; progress: ScanProgress }) => {
        if (event.scanId === scanId) {
          reply.raw.write(`event: progress\ndata: ${JSON.stringify(event.progress)}\n\n`);
        }
      };

      const onLinkResult = (event: { scanId: string; result: LinkResult }) => {
        if (event.scanId === scanId) {
          reply.raw.write(`event: link-result\ndata: ${JSON.stringify(event.result)}\n\n`);
        }
      };

      const onComplete = (event: { scanId: string; progress: ScanProgress }) => {
        if (event.scanId === scanId) {
          reply.raw.write(`event: complete\ndata: ${JSON.stringify(event.progress)}\n\n`);
        }
      };

      const onError = (event: { scanId: string; error: string }) => {
        if (event.scanId === scanId) {
          reply.raw.write(`event: scan-error\ndata: ${JSON.stringify({ error: event.error })}\n\n`);
        }
      };

      manager.on('scan:progress', onProgress);
      manager.on('scan:link-result', onLinkResult);
      manager.on('scan:complete', onComplete);
      manager.on('scan:error', onError);

      // Periodic heartbeat to prevent intermediate proxy timeout
      const pingInterval = setInterval(() => {
        if (!reply.raw.destroyed) {
          reply.raw.write(': ping\n\n');
        }
      }, 15_000);

      // Clean up when client disconnects
      const cleanup = () => {
        clearInterval(pingInterval);
        manager.off('scan:progress', onProgress);
        manager.off('scan:link-result', onLinkResult);
        manager.off('scan:complete', onComplete);
        manager.off('scan:error', onError);
      };

      request.raw.on('close', cleanup);
      request.raw.on('end', cleanup);
    },
  );

  /**
   * GET /ws/scans/:scanId — Bidirectional WebSocket connection.
   *
   * Streams scan events and accepts client commands ('pause', 'resume', 'stop').
   */
  app.get<{ Params: { scanId: string } }>(
    '/ws/scans/:scanId',
    { websocket: true },
    (socket: WebSocket, request) => {
      const { scanId } = request.params;
      const state = manager.getScan(scanId);

      if (!state) {
        socket.send(JSON.stringify({ type: 'error', error: `Scan not found: ${scanId}` }));
        socket.close();
        return;
      }

      // Send initial progress
      socket.send(JSON.stringify({ type: 'progress', data: state.progress }));

      const onProgress = (event: { scanId: string; progress: ScanProgress }) => {
        if (event.scanId === scanId && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'progress', data: event.progress }));
        }
      };

      const onLinkResult = (event: { scanId: string; result: LinkResult }) => {
        if (event.scanId === scanId && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'link-result', data: event.result }));
        }
      };

      const onComplete = (event: { scanId: string; progress: ScanProgress }) => {
        if (event.scanId === scanId && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'complete', data: event.progress }));
        }
      };

      const onError = (event: { scanId: string; error: string }) => {
        if (event.scanId === scanId && socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'error', data: { error: event.error } }));
        }
      };

      manager.on('scan:progress', onProgress);
      manager.on('scan:link-result', onLinkResult);
      manager.on('scan:complete', onComplete);
      manager.on('scan:error', onError);

      // Handle client commands
      socket.on('message', (message: Buffer | string) => {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.action === 'pause') {
            manager.pauseScan(scanId);
          } else if (payload.action === 'resume') {
            manager.resumeScan(scanId);
          } else if (payload.action === 'stop') {
            manager.stopScan(scanId);
          }
        } catch {
          // Ignore invalid messages
        }
      });

      socket.on('close', () => {
        manager.off('scan:progress', onProgress);
        manager.off('scan:link-result', onLinkResult);
        manager.off('scan:complete', onComplete);
        manager.off('scan:error', onError);
      });
    },
  );
}
