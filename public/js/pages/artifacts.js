/**
 * Artifacts Page
 * Redirects to the Portal page (Artifacts tab) which has the full
 * artifact browser with root selection, file tree, search, and viewer.
 */

export function render() {
  return `
    <div class="container page-shell">
      <div class="empty-state">Redirecting to Portal...</div>
    </div>
  `;
}

export async function mount() {
  if (typeof window !== 'undefined') {
    window.location.hash = '#/portal';
  }
  return () => {};
}
