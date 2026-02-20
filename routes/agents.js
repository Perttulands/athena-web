import express from 'express';
import { listAgents, getOutput, killAgent } from '../services/tmux-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();
const SESSION_NAME_PATTERN = /^agent-[A-Za-z0-9._-]+$/;

function isValidSessionName(name) {
  return SESSION_NAME_PATTERN.test(String(name || ''));
}

/**
 * GET /api/agents
 * List all agent sessions
 */
router.get('/', asyncHandler(async (req, res) => {
  const agents = await listAgents();
  res.json(agents);
}));

/**
 * GET /api/agents/:name/output
 * Get full output for a specific agent session
 */
router.get('/:name/output', asyncHandler(async (req, res) => {
  const { name } = req.params;
  if (!isValidSessionName(name)) {
    return res.status(400).json({
      error: true,
      message: 'Invalid session name format'
    });
  }

  const result = await getOutput(name, 200);

  if (result.error) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

/**
 * GET /api/agents/:name/stream
 * Stream live output from an agent session via SSE.
 * Polls tmux every 2 seconds and sends incremental output.
 */
router.get('/:name/stream', (req, res) => {
  const { name } = req.params;
  if (!isValidSessionName(name)) {
    return res.status(400).json({ error: true, message: 'Invalid session name format' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let lastLength = 0;
  let closed = false;

  const poll = async () => {
    if (closed) return;
    try {
      const result = await getOutput(name, 500);
      if (result.error) {
        res.write(`event: agent_error\ndata: ${JSON.stringify({ name, error: result.message })}\n\n`);
        return;
      }

      const output = result.output || '';
      if (output.length !== lastLength) {
        const newContent = output.length > lastLength ? output.slice(lastLength) : output;
        lastLength = output.length;
        res.write(`event: agent_output\ndata: ${JSON.stringify({ name, chunk: newContent, total: output.length })}\n\n`);
      }
    } catch {
      // poll silently fails
    }
  };

  // Initial send
  poll();
  const interval = setInterval(poll, 2000);

  req.on('close', () => {
    closed = true;
    clearInterval(interval);
  });
});

/**
 * POST /api/agents/:name/kill
 * Kill a tmux session
 */
router.post('/:name/kill', asyncHandler(async (req, res) => {
  const { name } = req.params;
  if (!isValidSessionName(name)) {
    return res.status(400).json({
      error: true,
      message: 'Invalid session name format'
    });
  }

  const result = await killAgent(name);

  if (result.error) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

export default router;
