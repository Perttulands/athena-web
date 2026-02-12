// Routes for beads API
import express from 'express';
import { listBeads } from '../services/beads-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /api/beads
 * List all beads with optional filtering and sorting
 * Query params:
 *   - status: Filter by status (todo, active, done, failed)
 *   - priority: Filter by priority number
 *   - sort: Sort by field (created, updated, priority)
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    priority: req.query.priority,
    sort: req.query.sort
  };

  const beads = await listBeads(filters);
  res.json(beads);
}));

export default router;
