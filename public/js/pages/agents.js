/**
 * Agents Page
 * Monitor running coding agents
 */

export function render() {
  return `
    <div class="container page-shell page-agents">
      <header class="page-header">
        <h1 class="page-title">Agents</h1>
        <p class="page-subtitle">Live sessions, output previews, and controls.</p>
      </header>

      <div class="agents-layout">
        <section class="page-section agents-grid">
          <article class="card card-compact">
            <h3 class="card-title">agent-bd-301</h3>
            <p class="section-subtitle">Running for 14m</p>
          </article>
          <article class="card card-compact">
            <h3 class="card-title">agent-bd-302</h3>
            <p class="section-subtitle">Running for 6m</p>
          </article>
        </section>
      </div>
    </div>
  `;
}
