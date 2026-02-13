import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { listBeads } from '../services/beads-service.js';
import { listAgents } from '../services/tmux-service.js';
import runsService from '../services/runs-service.js';
import ralphService from '../services/ralph-service.js';

const router = Router();

function isCanonicalStatus(bead, wanted) {
  const status = String(bead?.status || '').toLowerCase();
  const canonicalStatus = String(bead?.canonicalStatus || '').toLowerCase();
  return status === wanted || canonicalStatus === wanted;
}

/**
 * GET /api/status
 * Dashboard aggregate data from all services
 * Returns partial data with warnings if any service fails
 */
router.get('/', asyncHandler(async (req, res) => {
  const status = {
    athena: {
      status: 'watching',
      lastMessage: null,
      lastSeen: new Date().toISOString()
    },
    agents: {
      running: 0,
      total: 0,
      successRate: 0
    },
    beads: {
      todo: 0,
      active: 0,
      done: 0,
      failed: 0,
      open: 0,
      closed: 0,
      total: 0
    },
    ralph: {
      currentTask: null,
      iteration: 0,
      maxIterations: 0,
      prdProgress: { done: 0, total: 0 }
    },
    recentActivity: []
  };

  const warnings = [];

  // Fetch beads data
  try {
    const beads = await listBeads();
    status.beads.todo = beads.filter(bead => isCanonicalStatus(bead, 'todo')).length;
    status.beads.active = beads.filter(bead => isCanonicalStatus(bead, 'active')).length;
    status.beads.done = beads.filter(bead => isCanonicalStatus(bead, 'done')).length;
    status.beads.failed = beads.filter(bead => isCanonicalStatus(bead, 'failed')).length;
    status.beads.open = beads.filter(bead => String(bead?.status || '').toLowerCase() === 'open').length;
    status.beads.closed = beads.filter(bead => String(bead?.status || '').toLowerCase() === 'closed').length;
    status.beads.total = beads.length;
  } catch (error) {
    warnings.push({ service: 'beads', error: error.message });
  }

  // Fetch agents data
  try {
    const agents = await listAgents();
    status.agents.total = agents.length;
    status.agents.running = agents.filter(a => a.status === 'running').length;
  } catch (error) {
    warnings.push({ service: 'agents', error: error.message });
  }

  // Fetch runs data for success rate and recent activity
  try {
    const runs = await runsService.listRuns();

    // Calculate success rate
    if (runs.length > 0) {
      const successfulRuns = runs.filter(r => r.exit_code === 0).length;
      status.agents.successRate = parseFloat((successfulRuns / runs.length).toFixed(2));
    }

    // Get recent activity (last 10 runs)
    status.recentActivity = runs.slice(0, 10).map(run => ({
      time: run.started_at,
      type: run.exit_code === 0 ? 'agent_complete' : 'agent_failed',
      message: `Agent ${run.bead} ${run.exit_code === 0 ? 'completed' : 'failed'}` +
        (run.verification ?
          ` (lint: ${run.verification.lint || 'unknown'}, tests: ${run.verification.tests || 'unknown'})`
          : '')
    }));
  } catch (error) {
    warnings.push({ service: 'runs', error: error.message });
  }

  // Fetch Ralph status
  try {
    // PRD and progress files are in the project root
    const prdPath = 'PRD_ATHENA_WEB.md';
    const progressPath = 'progress_athena_web.txt';
    const ralph = await ralphService.getRalphStatus(prdPath, progressPath);
    status.ralph.currentTask = ralph.activeTask;
    status.ralph.iteration = ralph.currentIteration;
    status.ralph.maxIterations = ralph.maxIterations;
    status.ralph.prdProgress = {
      done: ralph.tasks.filter(t => t.done).length,
      total: ralph.tasks.length
    };

    // Update Athena's last message based on Ralph progress
    if (ralph.tasks.length > 0) {
      const completedTasks = ralph.tasks.filter(t => t.done).length;
      const totalTasks = ralph.tasks.length;
      if (completedTasks === totalTasks) {
        status.athena.lastMessage = `All tasks complete. ${totalTasks}/${totalTasks} done.`;
      } else if (ralph.activeTask) {
        status.athena.lastMessage = `Working on ${ralph.activeTask}. ${completedTasks}/${totalTasks} done.`;
      } else {
        status.athena.lastMessage = `${completedTasks}/${totalTasks} tasks done.`;
      }
    }
  } catch (error) {
    warnings.push({ service: 'ralph', error: error.message });
  }

  // Set default Athena message if not set
  if (!status.athena.lastMessage) {
    const activeAgents = status.agents.running;
    const activeBeads = status.beads.active;
    if (activeAgents > 0) {
      status.athena.lastMessage = `${activeAgents} agent${activeAgents === 1 ? '' : 's'} working on ${activeBeads} bead${activeBeads === 1 ? '' : 's'}.`;
    } else {
      status.athena.lastMessage = 'The swarm rests. All is quiet.';
    }
  }

  // Include warnings if any service failed
  if (warnings.length > 0) {
    status._warnings = warnings;
  }

  res.json(status);
}));

export default router;
