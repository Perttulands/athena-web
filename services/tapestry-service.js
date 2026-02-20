/**
 * Tapestry data model and service.
 * Transforms raw bead data into the tapestry view structure:
 * beads colored by status, sized by priority, grouped by canonical status.
 */

import { listBeads } from './beads-service.js';
import cache from './cache-service.js';

const STATUS_COLORS = Object.freeze({
  todo: '#6b7280',    // gray
  active: '#3b82f6',  // blue
  done: '#22c55e',    // green
  failed: '#ef4444',  // red
  unknown: '#9ca3af'  // light gray
});

const PRIORITY_SIZES = Object.freeze({
  1: 'lg',
  2: 'md',
  3: 'sm'
});

/**
 * Transform a normalized bead into a tapestry node.
 */
function toTapestryNode(bead) {
  const canonical = bead.canonicalStatus || 'unknown';
  return {
    id: bead.id,
    title: bead.title,
    status: bead.status,
    canonicalStatus: canonical,
    color: STATUS_COLORS[canonical] || STATUS_COLORS.unknown,
    priority: bead.priority,
    size: PRIORITY_SIZES[bead.priority] || 'sm',
    created: bead.created,
    updated: bead.updated,
    assignee: bead.assignee || bead.owner || null,
    tags: bead.tags || []
  };
}

/**
 * Get tapestry data: all beads transformed for the tapestry view.
 * Groups by canonical status, includes summary counts.
 */
export async function getTapestryData() {
  const beads = await cache.getOrFetch('beads', () => listBeads(), 5000);
  const nodes = beads.map(toTapestryNode);

  const groups = {
    todo: [],
    active: [],
    done: [],
    failed: []
  };

  for (const node of nodes) {
    const bucket = groups[node.canonicalStatus];
    if (bucket) {
      bucket.push(node);
    } else {
      // Unknown status goes to todo
      groups.todo.push(node);
    }
  }

  // Sort each group by priority (P1 first), then by updated date
  for (const group of Object.values(groups)) {
    group.sort((a, b) => {
      const pDiff = (a.priority ?? 99) - (b.priority ?? 99);
      if (pDiff !== 0) return pDiff;
      return new Date(b.updated || 0) - new Date(a.updated || 0);
    });
  }

  return {
    timestamp: new Date().toISOString(),
    total: nodes.length,
    summary: {
      todo: groups.todo.length,
      active: groups.active.length,
      done: groups.done.length,
      failed: groups.failed.length
    },
    groups,
    statusColors: STATUS_COLORS
  };
}

export { toTapestryNode, STATUS_COLORS, PRIORITY_SIZES };
