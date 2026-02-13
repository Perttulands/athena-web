/**
 * Beads Page
 * View and manage beads (tasks)
 */

export function render() {
  return `
    <div class="container page-shell page-beads">
      <header class="page-header">
        <h1 class="page-title">Beads</h1>
        <p class="page-subtitle">Task queue, filtering, and triage.</p>
      </header>

      <div class="beads-layout">
        <section class="page-section card">
          <h2 class="section-title">Filters</h2>
          <div class="filter-bar">
            <button class="btn btn-ghost btn-sm" type="button">All</button>
            <button class="btn btn-ghost btn-sm" type="button">Active</button>
            <button class="btn btn-ghost btn-sm" type="button">Done</button>
          </div>
        </section>

        <section class="page-section">
          <h2 class="section-title">Queue</h2>
          <div class="beads-list">
            <article class="card card-compact">
              <strong>bd-301</strong>
              <p class="section-subtitle">Refactor route handlers</p>
            </article>
            <article class="card card-compact">
              <strong>bd-302</strong>
              <p class="section-subtitle">Add oracle widget tests</p>
            </article>
          </div>
        </section>
      </div>
    </div>
  `;
}
