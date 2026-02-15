/**
 * Agents Page
 * Live monitor, output view, and kill controls.
 */

import api from '../api.js';
import sse from '../sse.js';
import {
  createBadge,
  createBottomSheet,
  createConfirmDialog,
  createLoadingSkeleton,
  createToast
} from '../components.js';

function formatDurationFrom(startedAt) {
  if (!startedAt) return '0m';
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return '0m';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const mins = Math.floor((diffSeconds % 3600) / 60);
  const secs = diffSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  }

  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function normalizeAgent(agent) {
  const startedAt = agent?.startedAt || agent?.started_at || null;
  const status = String(agent?.status || 'stopped').toLowerCase();

  return {
    name: agent?.name || 'unknown-agent',
    bead: agent?.bead || null,
    status,
    startedAt,
    runningTime: agent?.runningTime || formatDurationFrom(startedAt),
    lastOutput: String(agent?.lastOutput || '').trim(),
    contextPercent: Number(agent?.contextPercent ?? 0)
  };
}

function sortAgents(agents) {
  return [...agents].sort((a, b) => {
    const runningA = a.status === 'running' ? 1 : 0;
    const runningB = b.status === 'running' ? 1 : 0;
    if (runningA !== runningB) {
      return runningB - runningA;
    }

    const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    return timeB - timeA;
  });
}

function getOutputPreview(lastOutput) {
  const lines = String(lastOutput || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return 'No output yet.';
  return lines.slice(-3).join('\n');
}

function createContextBar(percent) {
  const wrap = document.createElement('div');
  wrap.className = 'agent-context';

  const track = document.createElement('div');
  track.className = 'agent-context-track';

  const fill = document.createElement('div');
  fill.className = 'agent-context-fill';
  fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;

  const value = document.createElement('span');
  value.className = 'agent-context-value';
  value.textContent = `${Math.round(Math.max(0, Math.min(100, percent)))}%`;

  track.appendChild(fill);
  wrap.append(track, value);
  return wrap;
}

function createAgentCard(agent) {
  const card = document.createElement('article');
  card.className = 'card agent-monitor-card card-appear';
  card.dataset.agentName = agent.name;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Open output for ${agent.name}`);

  const header = document.createElement('header');
  header.className = 'agent-monitor-header';

  const identity = document.createElement('div');
  identity.className = 'agent-monitor-identity';

  const name = document.createElement('h3');
  name.className = 'agent-monitor-name';
  name.textContent = agent.name;

  const bead = document.createElement('a');
  bead.className = 'agent-monitor-bead';
  bead.href = '#/beads';
  bead.textContent = agent.bead || 'No bead linked';
  bead.setAttribute('aria-label', `View bead ${agent.bead || ''}`);

  identity.append(name, bead);

  const statusWrap = document.createElement('div');
  statusWrap.className = 'agent-monitor-status';

  const statusDot = document.createElement('span');
  statusDot.className = `agent-status-dot${agent.status === 'running' ? ' running status-pulse' : ''}`;
  statusDot.setAttribute('aria-hidden', 'true');

  const statusBadge = createBadge(agent.status === 'running' ? 'running' : 'stopped');

  statusWrap.append(statusDot, statusBadge);

  header.append(identity, statusWrap);

  const runtime = document.createElement('div');
  runtime.className = 'agent-running-time';
  runtime.dataset.startedAt = agent.startedAt || '';
  runtime.dataset.status = agent.status;
  runtime.textContent = agent.status === 'running'
    ? `Running ${formatDurationFrom(agent.startedAt)}`
    : 'Stopped';

  const output = document.createElement('pre');
  output.className = 'agent-output-preview';
  output.textContent = getOutputPreview(agent.lastOutput);

  card.append(header, runtime, output, createContextBar(agent.contextPercent));

  return card;
}

function renderEmptyState(container) {
  container.innerHTML = '';

  const empty = document.createElement('div');
  empty.className = 'empty-state agents-empty-state';

  const img = document.createElement('img');
  img.src = '/assets/owl.svg';
  img.alt = 'Athena owl';
  img.className = 'empty-owl';
  img.width = 64;
  img.height = 64;

  const text = document.createElement('p');
  text.textContent = 'No agents running. The swarm rests.';

  empty.append(img, text);
  container.appendChild(empty);
}

function renderAgents(container, agents) {
  container.innerHTML = '';

  const sorted = sortAgents(agents);
  if (sorted.length === 0) {
    renderEmptyState(container);
    return;
  }

  sorted.forEach((agent, index) => {
    const card = createAgentCard(agent);
    card.style.animationDelay = `${index * 50}ms`;
    container.appendChild(card);
  });
}

function updateRuntimeLabels(scope) {
  scope.querySelectorAll('.agent-running-time').forEach((label) => {
    const status = label.dataset.status;
    if (status !== 'running') {
      label.textContent = 'Stopped';
      return;
    }

    const startedAt = label.dataset.startedAt;
    label.textContent = `Running ${formatDurationFrom(startedAt)}`;
  });
}

function renderOutputContent(agentName, outputText) {
  const wrapper = document.createElement('div');
  wrapper.className = 'agent-output-view';

  const title = document.createElement('div');
  title.className = 'agent-output-title';
  title.textContent = `${agentName} output`;

  const pre = document.createElement('pre');
  pre.className = 'agent-output-log';
  pre.textContent = outputText || 'No output captured yet.';

  const kill = document.createElement('button');
  kill.type = 'button';
  kill.className = 'btn btn-danger w-full agent-output-kill';
  kill.textContent = 'Kill Agent';
  kill.dataset.agentName = agentName;

  wrapper.append(title, pre, kill);
  return wrapper;
}

function mergeAgentState(currentAgents, payload) {
  const normalized = Array.isArray(currentAgents) ? [...currentAgents] : [];

  if (Array.isArray(payload?.agents)) {
    return payload.agents.map(normalizeAgent);
  }

  if (!payload?.name) {
    return normalized;
  }

  const update = normalizeAgent(payload);
  const index = normalized.findIndex((item) => item.name === update.name);

  if (index === -1) {
    normalized.push(update);
  } else {
    normalized[index] = {
      ...normalized[index],
      ...update
    };
  }

  return normalized;
}

export function render() {
  return `
    <div class="container page-shell page-agents">
      <header class="page-header">
        <h1 class="page-title">Agents</h1>
        <p class="page-subtitle">Live sessions, output previews, and controls.</p>
      </header>

      <section class="page-section">
        <div id="agents-list" class="agents-list" aria-live="polite">
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-agents') || document.querySelector('.page-agents');
  if (!scope) return () => {};

  const list = scope.querySelector('#agents-list');
  if (!list) return () => {};

  const state = {
    agents: [],
    activeAgent: null,
    runtimeTimer: null
  };

  const outputSheet = createBottomSheet({
    title: 'Agent output',
    content: createLoadingSkeleton('card'),
    className: 'agent-output-sheet'
  });

  async function loadAndRender() {
    const agents = await api.get('/agents');
    state.agents = Array.isArray(agents) ? agents.map(normalizeAgent) : [];
    renderAgents(list, state.agents);
    updateRuntimeLabels(scope);
  }

  async function refreshOutput(agentName) {
    try {
      const result = await api.get(`/agents/${encodeURIComponent(agentName)}/output`);
      const outputContent = renderOutputContent(agentName, result?.output || '');
      outputSheet.setContent(outputContent);

      const pre = outputContent.querySelector('.agent-output-log');
      pre.scrollTop = pre.scrollHeight;
    } catch (error) {
      outputSheet.setContent(renderOutputContent(agentName, 'Failed to load output.'));
      createToast({ type: 'error', message: error?.message || 'Failed to load output' });
    }
  }

  async function openOutput(agentName) {
    state.activeAgent = agentName;
    outputSheet.setTitle(`Agent ${agentName}`);
    outputSheet.setContent(createLoadingSkeleton('card'));
    outputSheet.open();
    await refreshOutput(agentName);
  }

  function maybeOpenFromEvent(event) {
    const beadLink = event.target.closest('.agent-monitor-bead');
    if (beadLink) {
      return;
    }

    const card = event.target.closest('.agent-monitor-card');
    if (!card) return;

    const agentName = card.dataset.agentName;
    if (!agentName) return;
    openOutput(agentName);
  }

  function onListKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.agent-monitor-card');
    if (!card) return;

    event.preventDefault();
    const agentName = card.dataset.agentName;
    if (!agentName) return;
    openOutput(agentName);
  }

  async function onOutputAction(event) {
    const killButton = event.target.closest('.agent-output-kill');
    if (!killButton) return;

    const agentName = killButton.dataset.agentName;
    if (!agentName) return;

    const dialog = createConfirmDialog({
      title: 'Kill agent session?',
      message: `Kill ${agentName}? This stops the running session immediately.`,
      onConfirm: async () => {
        try {
          await api.post(`/agents/${encodeURIComponent(agentName)}/kill`, {});
          state.agents = state.agents.filter((agent) => agent.name !== agentName);
          renderAgents(list, state.agents);
          updateRuntimeLabels(scope);
          outputSheet.close();
          createToast({ type: 'success', message: `Killed ${agentName}` });
        } catch (error) {
          createToast({ type: 'error', message: error?.message || 'Failed to kill agent' });
        }
      }
    });

    document.body.appendChild(dialog);
  }

  function onSSEAgentStatus(payload) {
    state.agents = mergeAgentState(state.agents, payload);
    renderAgents(list, state.agents);
    updateRuntimeLabels(scope);

    if (state.activeAgent && outputSheet.isOpen()) {
      const changed = Array.isArray(payload?.agents)
        ? payload.agents.some((agent) => agent?.name === state.activeAgent)
        : payload?.name === state.activeAgent;

      if (changed) {
        void refreshOutput(state.activeAgent);
      }
    }
  }

  list.addEventListener('click', maybeOpenFromEvent);
  list.addEventListener('keydown', onListKeyDown);
  outputSheet.panel.addEventListener('click', onOutputAction);

  if (sse?.on) {
    sse.on('agent_status', onSSEAgentStatus);
  }

  try {
    await loadAndRender();
  } catch (error) {
    renderEmptyState(list);
    createToast({ type: 'error', message: error?.message || 'Failed to load agents' });
  }

  state.runtimeTimer = setInterval(() => {
    updateRuntimeLabels(scope);
  }, 1000);

  return () => {
    list.removeEventListener('click', maybeOpenFromEvent);
    list.removeEventListener('keydown', onListKeyDown);
    outputSheet.panel.removeEventListener('click', onOutputAction);

    if (sse?.off) {
      sse.off('agent_status', onSSEAgentStatus);
    }

    if (state.runtimeTimer) {
      clearInterval(state.runtimeTimer);
    }

    if (outputSheet.isOpen()) {
      outputSheet.close();
    }
  };
}
