import express from 'express';
import { listAgents, getOutput, killAgent } from '../services/tmux-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

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
  const result = await getOutput(name, 200);

  if (result.error) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

/**
 * POST /api/agents/:name/kill
 * Kill a tmux session
 */
router.post('/:name/kill', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const result = await killAgent(name);

  if (result.error) {
    return res.status(404).json(result);
  }

  res.json(result);
}));

export default router;
