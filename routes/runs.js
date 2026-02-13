import { Router } from 'express';
import runsService from '../services/runs-service.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = Router();

/**
 * GET /api/runs
 * Returns list of run records with optional filtering
 * Query params: status, date, agent, bead
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    date: req.query.date,
    agent: req.query.agent,
    bead: req.query.bead
  };

  const runs = await runsService.listRuns(filters);
  res.json(runs);
}));

export default router;
