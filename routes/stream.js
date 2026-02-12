import express from 'express';
import SSEService from '../services/sse-service.js';

const router = express.Router();
const sseService = new SSEService();

/**
 * GET /api/stream
 * Server-Sent Events endpoint for real-time updates
 */
router.get('/stream', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Start heartbeat on first client connection
  if (sseService.clients.size === 0 && process.env.NODE_ENV !== 'test') {
    sseService.startHeartbeat();
  }

  // Add this client to the service
  sseService.addClient(res);

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

  // Keep connection open - will close when client disconnects
  req.on('close', () => {
    sseService.removeClient(res);

    // Stop heartbeat when no clients connected
    if (sseService.clients.size === 0) {
      sseService.stopHeartbeat();
    }
  });
});

// Export both router and service instance for use by other modules
export default router;
export { sseService };
