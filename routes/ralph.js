import { Router } from 'express';
import { join } from 'node:path';
import ralphService from '../services/ralph-service.js';
import { asyncHandler } from '../middleware/error-handler.js';
import config from '../config.js';

const router = Router();

/**
 * GET /api/ralph
 * Returns Ralph loop status (PRD tasks and progress)
 * Query params: prd (path to PRD file), progress (path to progress file)
 */
router.get('/', asyncHandler(async (req, res) => {
  // Default paths if not provided
  const prdPath = req.query.prd || join(config.workspacePath, 'PRD_ATHENA_WEB.md');
  const progressPath = req.query.progress || join(config.workspacePath, 'progress_athena_web.txt');

  const status = await ralphService.getRalphStatus(prdPath, progressPath);
  res.json(status);
}));

export default router;
