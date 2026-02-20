import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { getTimeline } from '../services/timeline-service.js';

const router = Router();

/**
 * GET /api/timeline
 * Returns run history as timeline events grouped by day.
 * Query params: limit, status, bead, agent
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    limit: req.query.limit,
    status: req.query.status,
    bead: req.query.bead,
    agent: req.query.agent
  };
  const data = await getTimeline(filters);
  res.json(data);
}));

export default router;
