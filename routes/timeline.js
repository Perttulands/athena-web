import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { getTimeline } from '../services/timeline-service.js';

const router = Router();

/**
 * GET /api/timeline
 * Returns run history as timeline events grouped by day.
 * Query params: limit, offset, status, bead, agent, since, until
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    limit: req.query.limit,
    offset: req.query.offset,
    status: req.query.status,
    bead: req.query.bead,
    agent: req.query.agent,
    since: req.query.since,
    until: req.query.until
  };
  const data = await getTimeline(filters);
  res.json(data);
}));

export default router;
