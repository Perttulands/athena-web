import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { getHealthDashboard } from '../services/health-service.js';

const router = Router();

/**
 * GET /api/health-dashboard
 * Returns system health metrics: process info, service checks, cache stats.
 */
router.get('/', asyncHandler(async (req, res) => {
  const data = await getHealthDashboard();
  res.json(data);
}));

export default router;
