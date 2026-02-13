/**
 * Oracle (Dashboard) Page
 * Live overview: Athena message, stats, active agents, activity feed, Ralph progress.
 */

import api from '../api.js';
import sse from '../sse.js';
import { enablePullToRefresh, enableSwipe } from '../gestures.js';
import {
  createActivityItem,
  createCard,
  createConfirmDialog,
  createLoadingSkeleton,
  createStatBox,
  createToast
} from '../components.js';

const MAX_ACTIVITY_ITEMS = 10;

function formatTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function percent(value, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function normalizeActivity(item) {
  if (!item || typeof item !== 'object') {
    return {
      time: new Date().toISOString(),
      type: 'activity',
      message: 'Temple state changed'
    };
  }

  return {
    time: item.time || item.timestamp || new Date().toISOString(),
    type: item.type || 'activity',
    message: item.message || 'Temple state changed'
  };
}

function normalizeStatus(status) {
  return {
    athena: {
      lastMessage: status?.athena?.lastMessage || 'The oracle listens in silence.',
      lastSeen: status?.athena?.lastSeen || null
    },
    agents: {
      running: Number(status?.agents?.running || 0),
      total: Number(status?.agents?.total || 0),
      successRate: Number(status?.agents?.successRate || 0)
    },
    beads: {
      active: Number(status?.beads?.active || 0)
    },
    ralph: {
      currentTask: status?.ralph?.currentTask || null,
      iteration: Number(status?.ralph?.iteration || 0),
      maxIterations: Number(status?.ralph?.maxIterations || 0),
      prdProgress: {
        done: Number(status?.ralph?.prdProgress?.done || 0),
        total: Number(status?.ralph?.prdProgress?.total || 0)
      }
    },
    recentActivity: Array.isArray(status?.recentActivity)
      ? status.recentActivity.map(normalizeActivity).slice(0, MAX_ACTIVITY_ITEMS)
      : []
  };
}

function normalizeRalph(ralph) {
  return {
    activeTask: ralph?.activeTask || null,
    currentIteration: Number(ralph?.currentIteration || 0),
    maxIterations: Number(ralph?.maxIterations || 0),
    prdProgress: {
      done: Number(ralph?.prdProgress?.done || 0),
      total: Number(ralph?.prdProgress?.total || 0)
    },
    tasks: Array.isArray(ralph?.tasks) ? ralph.tasks : []
  };
}

function upcomingTasks(tasks, activeTask) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const activeIndex = activeTask
    ? tasks.findIndex(task => task.id === activeTask)
    : -1;

  if (activeIndex >= 0) {
    const nextAfterActive = tasks.slice(activeIndex + 1).filter(task => !task.done);
    if (nextAfterActive.length > 0) return nextAfterActive.slice(0, 3);
  }

  return tasks.filter(task => !task.done && task.id !== activeTask).slice(0, 3);
}

function renderSkeletons(scope) {
  const statGrid = scope.querySelector('#oracle-stat-grid');
  const agents = scope.querySelector('#oracle-agent-list');
  const activity = scope.querySelector('#oracle-activity-list');
  const ralph = scope.querySelector('#oracle-ralph-content');

  if (statGrid) {
    statGrid.innerHTML = '';
    for (let i = 0; i < 4; i += 1) {
      statGrid.appendChild(createLoadingSkeleton('card'));
    }
  }

  if (agents) {
    agents.innerHTML = '';
    for (let i = 0; i < 2; i += 1) {
      agents.appendChild(createLoadingSkeleton('card'));
    }
  }

  if (activity) {
    activity.innerHTML = '';
    for (let i = 0; i < 4; i += 1) {
      const item = document.createElement('li');
      item.className = 'list-item';
      item.appendChild(createLoadingSkeleton('text'));
      activity.appendChild(item);
    }
  }

  if (ralph) {
    ralph.innerHTML = '';
    ralph.appendChild(createLoadingSkeleton('card'));
  }
}

function renderMessage(scope, status) {
  const messageText = scope.querySelector('#oracle-message-text');
  const messageTime = scope.querySelector('#oracle-message-time');

  if (messageText) {
    messageText.textContent = status.athena.lastMessage;
  }

  if (messageTime) {
    messageTime.textContent = `Last seen: ${formatDateTime(status.athena.lastSeen)}`;
  }
}

function ensureStatBox(scope, id, label, tone = 'gold') {
  const statGrid = scope.querySelector('#oracle-stat-grid');
  if (!statGrid) return null;

  let box = statGrid.querySelector(`[data-stat-id="${id}"]`);
  if (!box) {
    box = createStatBox({ label, value: '0' });
    box.dataset.statId = id;
    box.dataset.statTone = tone;
    statGrid.appendChild(box);
  }
  return box;
}

function updateStatValue(box, value, trendText) {
  if (!box) return;
  const valueEl = box.querySelector('.stat-value');
  if (valueEl) {
    valueEl.textContent = value;
  }

  let trendEl = box.querySelector('.stat-trend');
  if (!trendText) {
    if (trendEl) trendEl.remove();
    return;
  }

  if (!trendEl) {
    trendEl = document.createElement('div');
    trendEl.className = 'stat-trend trend-flat';
    box.appendChild(trendEl);
  }
  trendEl.textContent = trendText;
}

function renderStats(scope, status) {
  const statGrid = scope.querySelector('#oracle-stat-grid');
  if (!statGrid) return;

  if (!statGrid.querySelector('[data-stat-id]')) {
    statGrid.innerHTML = '';
  }

  const runningBox = ensureStatBox(scope, 'agents-running', 'Agents running', 'gold');
  const beadsBox = ensureStatBox(scope, 'beads-active', 'Beads active', 'gold');
  const successBox = ensureStatBox(scope, 'success-rate', 'Success rate', 'success');
  const ralphBox = ensureStatBox(scope, 'ralph-progress', 'Ralph progress', 'gold');

  updateStatValue(runningBox, String(status.agents.running), `${status.agents.total} total`);
  updateStatValue(beadsBox, String(status.beads.active), 'active now');

  const successPct = Math.round(status.agents.successRate * 100);
  updateStatValue(successBox, `${successPct}%`, 'recent runs');

  const done = status.ralph.prdProgress.done;
  const total = status.ralph.prdProgress.total;
  updateStatValue(ralphBox, total > 0 ? `${done}/${total}` : '0/0', 'PRD tasks');
}

function createAgentCard(agent) {
  const wrapper = document.createElement('div');
  wrapper.className = 'agent-card-wrapper';

  const card = createCard({
    title: agent.name || 'Unnamed agent',
    status: agent.status || 'running'
  });
  card.classList.add('agent-status-card');
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  const body = card.querySelector('.card-body');
  if (!body) return card;

  const meta = document.createElement('div');
  meta.className = 'agent-status-meta';

  const bead = document.createElement('span');
  bead.textContent = agent.bead || 'No bead';
  meta.appendChild(bead);

  const runningTime = document.createElement('span');
  runningTime.textContent = agent.runningTime || '0m';
  meta.appendChild(runningTime);

  body.appendChild(meta);

  const output = document.createElement('div');
  output.className = 'agent-status-output';
  output.textContent = String(agent.lastOutput || 'No output yet').replace(/\n+/g, ' ');
  body.appendChild(output);

  const contextWrap = document.createElement('div');
  contextWrap.className = 'agent-status-context';

  const contextBar = document.createElement('div');
  contextBar.className = 'agent-status-context-bar';

  const contextFill = document.createElement('div');
  contextFill.className = 'agent-status-context-fill';
  const context = Number(agent.contextPercent ?? 0);
  contextFill.style.width = `${Math.max(0, Math.min(100, context))}%`;
  contextBar.appendChild(contextFill);

  const contextValue = document.createElement('span');
  contextValue.className = 'agent-status-context-value';
  contextValue.textContent = `${Math.round(context)}%`;

  contextWrap.append(contextBar, contextValue);
  body.appendChild(contextWrap);

  // Create kill button (initially hidden)
  const killButton = document.createElement('button');
  killButton.className = 'btn btn-danger agent-kill-button';
  killButton.textContent = 'Kill';
  killButton.setAttribute('aria-label', `Kill agent ${agent.name}`);

  killButton.addEventListener('click', async (e) => {
    e.stopPropagation();

    const dialog = createConfirmDialog({
      title: 'Kill Agent?',
      message: `Are you sure you want to kill ${agent.name}? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.post(`/agents/${agent.name}/kill`);
          createToast({ message: `Agent ${agent.name} killed`, type: 'success' });
          wrapper.remove();
        } catch (error) {
          createToast({ message: error.message || 'Failed to kill agent', type: 'error' });
        }
      }
    });

    document.body.appendChild(dialog);
  });

  const navigateAgents = () => {
    window.location.hash = '#/agents';
  };

  card.addEventListener('click', navigateAgents);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigateAgents();
    }
  });

  // Enable swipe-to-reveal kill button
  enableSwipe(wrapper, (direction) => {
    if (direction === 'left') {
      wrapper.classList.add('swiped-left');
    } else if (direction === 'right') {
      wrapper.classList.remove('swiped-left');
    }
  });

  wrapper.appendChild(card);
  wrapper.appendChild(killButton);

  return wrapper;
}

function renderAgents(scope, agents) {
  const list = scope.querySelector('#oracle-agent-list');
  if (!list) return;

  const runningAgents = Array.isArray(agents)
    ? agents.filter(agent => agent.status === 'running')
    : [];

  list.innerHTML = '';

  if (runningAgents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No active agents at the moment.';
    list.appendChild(empty);
    return;
  }

  runningAgents.forEach(agent => {
    list.appendChild(createAgentCard(agent));
  });
}

function renderActivity(scope, activity) {
  const list = scope.querySelector('#oracle-activity-list');
  if (!list) return;

  list.innerHTML = '';

  if (!Array.isArray(activity) || activity.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'list-item empty-state';
    empty.textContent = 'No recent activity.';
    list.appendChild(empty);
    return;
  }

  activity.slice(0, MAX_ACTIVITY_ITEMS).forEach(entry => {
    const normalized = normalizeActivity(entry);
    list.appendChild(createActivityItem({
      time: formatTime(normalized.time),
      type: normalized.type,
      message: normalized.message
    }));
  });
}

function renderRalph(scope, ralph) {
  const container = scope.querySelector('#oracle-ralph-content');
  if (!container) return;

  container.innerHTML = '';

  const hasRalphData = Boolean(
    ralph.activeTask
    || (ralph.prdProgress.total > 0)
    || (Array.isArray(ralph.tasks) && ralph.tasks.length > 0)
  );

  if (!hasRalphData) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No active Ralph loop';
    container.appendChild(empty);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ralph-progress';

  const track = document.createElement('div');
  track.className = 'ralph-progress-track';

  const fill = document.createElement('div');
  fill.className = 'ralph-progress-fill';
  fill.style.width = `${percent(ralph.prdProgress.done, ralph.prdProgress.total)}%`;
  track.appendChild(fill);
  wrapper.appendChild(track);

  const meta = document.createElement('div');
  meta.className = 'ralph-progress-meta';
  meta.innerHTML = `
    <span>${ralph.prdProgress.done} / ${ralph.prdProgress.total} tasks complete</span>
    <span>Iteration ${ralph.currentIteration || 0} of ${ralph.maxIterations || 0}</span>
  `;
  wrapper.appendChild(meta);

  const currentTask = document.createElement('div');
  currentTask.className = 'ralph-current-task';

  const taskId = document.createElement('div');
  taskId.className = 'ralph-current-task-id';
  taskId.textContent = ralph.activeTask || 'No active task';
  currentTask.appendChild(taskId);

  const taskHint = document.createElement('div');
  taskHint.className = 'text-secondary text-sm';
  taskHint.textContent = ralph.activeTask
    ? 'Current focus'
    : 'Waiting for next cycle';
  currentTask.appendChild(taskHint);
  wrapper.appendChild(currentTask);

  const upcoming = upcomingTasks(ralph.tasks, ralph.activeTask);
  if (upcoming.length > 0) {
    const list = document.createElement('ul');
    list.className = 'ralph-upcoming-list';

    upcoming.forEach(task => {
      const item = document.createElement('li');
      item.className = `ralph-upcoming-item${task.done ? ' done' : ''}`;

      const box = document.createElement('span');
      box.className = 'ralph-upcoming-check';
      box.textContent = task.done ? '✓' : '';

      const label = document.createElement('span');
      label.textContent = `${task.id} ${task.title}`;

      item.append(box, label);
      list.appendChild(item);
    });

    wrapper.appendChild(list);
  }

  container.appendChild(wrapper);
}

function mergeAgentUpdate(agents, update) {
  if (!Array.isArray(agents)) return [];
  const idx = agents.findIndex(agent => agent.name === update.name);

  if (idx === -1) {
    return [...agents, update];
  }

  const merged = [...agents];
  merged[idx] = { ...merged[idx], ...update };
  return merged;
}

function applyAgentSSE(state, payload) {
  if (Array.isArray(payload?.agents)) {
    state.agents = payload.agents;
  } else if (payload && payload.name) {
    state.agents = mergeAgentUpdate(state.agents, payload);
  }

  if (typeof payload?.running === 'number') {
    state.status.agents.running = payload.running;
  } else {
    state.status.agents.running = state.agents.filter(agent => agent.status === 'running').length;
  }

  if (typeof payload?.total === 'number') {
    state.status.agents.total = payload.total;
  } else {
    state.status.agents.total = state.agents.length;
  }
}

function applyBeadSSE(state, payload) {
  const source = payload?.beads || payload || {};
  if (typeof source.active === 'number') {
    state.status.beads.active = source.active;
  }
}

function applyRalphSSE(state, payload) {
  if (!payload || typeof payload !== 'object') return;
  state.ralph = {
    ...state.ralph,
    activeTask: payload.currentTask || payload.activeTask || state.ralph.activeTask,
    currentIteration: Number(payload.iteration || payload.currentIteration || state.ralph.currentIteration || 0),
    maxIterations: Number(payload.maxIterations || state.ralph.maxIterations || 0),
    prdProgress: payload.prdProgress
      ? {
          done: Number(payload.prdProgress.done || 0),
          total: Number(payload.prdProgress.total || 0)
        }
      : state.ralph.prdProgress,
    tasks: Array.isArray(payload.tasks) ? payload.tasks : state.ralph.tasks
  };

  state.status.ralph.currentTask = state.ralph.activeTask;
  state.status.ralph.iteration = state.ralph.currentIteration;
  state.status.ralph.maxIterations = state.ralph.maxIterations;
  state.status.ralph.prdProgress = { ...state.ralph.prdProgress };
}

function subscribeToSSE(scope, state) {
  if (!sse || typeof sse.on !== 'function') {
    return () => {};
  }

  const listeners = {
    agent_status: (payload) => {
      applyAgentSSE(state, payload);
      renderAgents(scope, state.agents);
      renderStats(scope, state.status);
    },
    bead_update: (payload) => {
      applyBeadSSE(state, payload);
      renderStats(scope, state.status);
    },
    ralph_progress: (payload) => {
      applyRalphSSE(state, payload);
      renderStats(scope, state.status);
      renderRalph(scope, state.ralph);
    },
    activity: (payload) => {
      const entry = normalizeActivity(payload);
      state.status.recentActivity = [entry, ...state.status.recentActivity].slice(0, MAX_ACTIVITY_ITEMS);
      renderActivity(scope, state.status.recentActivity);
    }
  };

  Object.entries(listeners).forEach(([eventType, callback]) => {
    sse.on(eventType, callback);
  });

  return () => {
    if (typeof sse.off !== 'function') return;
    Object.entries(listeners).forEach(([eventType, callback]) => {
      sse.off(eventType, callback);
    });
  };
}

export function render() {
  return `
    <div class="container page-shell page-oracle">
      <header class="page-header">
        <h1 class="page-title">Oracle</h1>
        <p class="page-subtitle">Temple telemetry and live swarm activity.</p>
      </header>

      <section class="page-section">
        <article class="card oracle-message-card">
          <blockquote class="oracle-message-quote">
            <p id="oracle-message-text" class="oracle-message-text">Listening for Athena...</p>
            <footer id="oracle-message-time" class="oracle-message-meta">Last seen: Unknown</footer>
          </blockquote>
        </article>
      </section>

      <section class="page-section">
        <h2 class="section-title">Temple Pulse</h2>
        <div id="oracle-stat-grid" class="oracle-stat-grid"></div>
      </section>

      <div class="oracle-columns">
        <section class="page-section oracle-agents-section">
          <h2 class="section-title">Active Agents</h2>
          <p class="section-subtitle">Tap a card to open the Agents view.</p>
          <div id="oracle-agent-list" class="oracle-agent-grid"></div>
        </section>

        <section class="page-section oracle-activity-section">
          <h2 class="section-title">Recent Activity</h2>
          <article class="card oracle-activity-card">
            <ul id="oracle-activity-list" class="list oracle-activity-list"></ul>
          </article>
        </section>
      </div>

      <section class="page-section">
        <h2 class="section-title">Ralph Progress</h2>
        <article class="card">
          <div id="oracle-ralph-content"></div>
        </article>
      </section>
    </div>
  `;
}

async function refreshData(scope, state) {
  try {
    const [statusData, agentsData, ralphData] = await Promise.all([
      api.get('/status'),
      api.get('/agents'),
      api.get('/ralph')
    ]);

    state.status = normalizeStatus(statusData);
    state.agents = Array.isArray(agentsData) ? agentsData : [];
    state.ralph = normalizeRalph(ralphData);

    // Keep the aggregated status and detailed Ralph state aligned.
    state.status.ralph.currentTask = state.ralph.activeTask;
    state.status.ralph.iteration = state.ralph.currentIteration;
    state.status.ralph.maxIterations = state.ralph.maxIterations;
    state.status.ralph.prdProgress = { ...state.ralph.prdProgress };

    renderMessage(scope, state.status);
    renderStats(scope, state.status);
    renderAgents(scope, state.agents);
    renderActivity(scope, state.status.recentActivity);
    renderRalph(scope, state.ralph);

    return true;
  } catch (error) {
    const message = error?.message || 'Failed to refresh oracle status';
    createToast({ message, type: 'error' });
    return false;
  }
}

export async function mount(root) {
  const scope = root?.querySelector('.page-oracle') || document.querySelector('.page-oracle');
  if (!scope) return () => {};

  renderSkeletons(scope);

  const state = {
    status: normalizeStatus(null),
    agents: [],
    ralph: normalizeRalph(null)
  };

  // Initial data load
  await refreshData(scope, state);

  // Enable pull-to-refresh
  const cleanupPullToRefresh = enablePullToRefresh(scope, async () => {
    await refreshData(scope, state);
  });

  // Subscribe to SSE updates
  const cleanupSSE = subscribeToSSE(scope, state);

  // Return combined cleanup function
  return () => {
    cleanupPullToRefresh();
    cleanupSSE();
  };
}
