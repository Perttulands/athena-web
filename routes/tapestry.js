import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { getTapestryData } from '../services/tapestry-service.js';

const router = Router();

/**
 * GET /api/tapestry
 * Returns all beads transformed for the tapestry view,
 * grouped by canonical status, colored and sized.
 */
router.get('/', asyncHandler(async (req, res) => {
  const data = await getTapestryData();
  res.json(data);
}));

export default router;
