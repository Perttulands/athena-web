/**
 * Scrolls (Docs) Page
 * Browse and edit workspace documentation
 */

export function render() {
  return `
    <div class="container page-shell page-scrolls">
      <header class="page-header">
        <h1 class="page-title">Scrolls</h1>
        <p class="page-subtitle">Workspace documents and editing workflow.</p>
      </header>

      <div class="scrolls-layout">
        <aside class="scrolls-sidebar">
          <h2 class="section-title">Tree</h2>
          <p class="section-subtitle">README.md</p>
          <p class="section-subtitle">PRD_ATHENA_WEB.md</p>
        </aside>
        <section class="scrolls-content">
          <h2 class="section-title">Document</h2>
          <p class="section-subtitle">Select a file to view markdown content.</p>
        </section>
      </div>
    </div>
  `;
}
