/**
 * Activity API routes.
 * GET  /api/activity         — Recent activity events
 * GET  /api/activity/stats   — Activity statistics
 * POST /api/activity/report  — Client error reports from error boundary
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import activityService from '../services/activity-service.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { limit, type, since } = req.query;
  const events = await activityService.query({
    limit: limit ? parseInt(limit, 10) : undefined,
    type: type || undefined,
    since: since || undefined
  });
  res.json(events);
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await activityService.stats();
  res.json(stats);
}));

router.post('/report', asyncHandler(async (req, res) => {
  const { type, error, source, stack } = req.body || {};
  if (!error) {
    return res.status(400).json({ error: 'Missing error field', status: 400 });
  }

  await activityService.record({
    type: type || 'client_error',
    error: String(error).slice(0, 500),
    source: String(source || '').slice(0, 200),
    stack: String(stack || '').slice(0, 500)
  });

  res.json({ recorded: true });
}));

export default router;
