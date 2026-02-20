/**
 * Health Dashboard Page
 * Displays process metrics, service checks, and cache stats.
 */

import api from '../api.js';
import { createBadge, createStatBox, createToast } from '../components.js';

function formatMemory(mb) {
  if (mb == null) return '-';
  return `${mb} MB`;
}

function createServiceRow(service) {
  const row = document.createElement('div');
  row.className = 'health-service-row';

  const name = document.createElement('span');
  name.className = 'health-service-name';
  name.textContent = service.name;

  const badge = createBadge(service.status === 'ok' ? 'done' : 'failed');

  const latency = document.createElement('span');
  latency.className = 'health-service-latency text-sm text-secondary';
  latency.textContent = service.latencyMs != null ? `${service.latencyMs}ms` : '';

  row.append(name, badge, latency);

  if (service.error) {
    const errEl = document.createElement('div');
    errEl.className = 'health-service-error text-sm';
    errEl.style.color = 'var(--danger)';
    errEl.textContent = service.error;
    row.appendChild(errEl);
  }

  return row;
}

function renderDashboard(scope, data) {
  const container = scope.querySelector('#health-content');
  if (!container) return;
  container.innerHTML = '';

  // Overall status
  const overallBadge = createBadge(data.overall === 'healthy' ? 'done' : 'warning');
  const overallRow = document.createElement('div');
  overallRow.className = 'health-overall';
  const overallLabel = document.createElement('span');
  overallLabel.textContent = `System: ${data.overall}`;
  overallLabel.className = 'text-lg';
  overallRow.append(overallLabel, overallBadge);
  container.appendChild(overallRow);

  // Process stats
  const statsGrid = document.createElement('div');
  statsGrid.className = 'chronicle-stats-grid';

  const proc = data.process || {};
  statsGrid.append(
    createStatBox({ label: 'Uptime', value: proc.uptimeFormatted || '-' }),
    createStatBox({ label: 'RSS', value: formatMemory(proc.memory?.rss) }),
    createStatBox({ label: 'Heap Used', value: formatMemory(proc.memory?.heapUsed) }),
    createStatBox({ label: 'Node', value: proc.nodeVersion || '-' })
  );
  container.appendChild(statsGrid);

  // Services
  if (Array.isArray(data.services) && data.services.length > 0) {
    const servicesSection = document.createElement('section');
    servicesSection.className = 'card';
    const servicesTitle = document.createElement('h3');
    servicesTitle.className = 'card-title';
    servicesTitle.textContent = 'Service Checks';
    servicesSection.appendChild(servicesTitle);

    const servicesList = document.createElement('div');
    servicesList.className = 'health-services-list';
    data.services.forEach((s) => servicesList.appendChild(createServiceRow(s)));
    servicesSection.appendChild(servicesList);
    container.appendChild(servicesSection);
  }

  // Cache stats
  if (data.cache) {
    const cacheSection = document.createElement('section');
    cacheSection.className = 'card';
    const cacheTitle = document.createElement('h3');
    cacheTitle.className = 'card-title';
    cacheTitle.textContent = 'Cache Stats';
    cacheSection.appendChild(cacheTitle);

    const cacheGrid = document.createElement('div');
    cacheGrid.className = 'chronicle-stats-grid';
    cacheGrid.append(
      createStatBox({ label: 'Entries', value: String(data.cache.size ?? 0) }),
      createStatBox({ label: 'Hits', value: String(data.cache.hits ?? 0) }),
      createStatBox({ label: 'Misses', value: String(data.cache.misses ?? 0) }),
      createStatBox({ label: 'Hit Rate', value: data.cache.hitRate != null ? `${Math.round(data.cache.hitRate * 100)}%` : '-' })
    );
    cacheSection.appendChild(cacheGrid);
    container.appendChild(cacheSection);
  }
}

export function render() {
  return `
    <div class="container page-shell page-health">
      <header class="page-header">
        <h1 class="page-title">Health Dashboard</h1>
        <p class="page-subtitle">Process metrics, service checks, and cache performance.</p>
      </header>
      <section id="health-content" aria-live="polite">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </section>
    </div>
  `;
}

export async function mount(root) {
  const scope = root?.querySelector('.page-health') || document.querySelector('.page-health');
  if (!scope) return () => {};

  let refreshTimer = null;

  async function load() {
    try {
      const data = await api.get('/health-dashboard');
      renderDashboard(scope, data);
    } catch (error) {
      const container = scope.querySelector('#health-content');
      if (container) {
        container.innerHTML = '<div class="empty-state">Failed to load health data.</div>';
      }
      createToast({ type: 'error', message: error?.message || 'Health dashboard unavailable' });
    }
  }

  await load();
  // Auto-refresh every 15 seconds
  refreshTimer = setInterval(load, 15000);

  return () => {
    if (refreshTimer) clearInterval(refreshTimer);
  };
}
