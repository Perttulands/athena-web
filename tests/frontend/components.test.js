import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('UI Components', () => {
  let components;

  before(async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost:9000'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    components = await import(`../../public/js/components.js?t=${Date.now()}`);
  });

  after(() => {
    delete global.window;
    delete global.document;
    delete global.Node;
  });

  it('createCard should return a card element with title, body and footer', () => {
    const card = components.createCard({
      title: 'Agent Status',
      body: 'Running steady',
      status: 'running',
      footer: 'Updated now'
    });

    assert.ok(card.classList.contains('card'));
    assert.strictEqual(card.querySelector('.card-title').textContent, 'Agent Status');
    assert.strictEqual(card.querySelector('.card-body').textContent, 'Running steady');
    assert.strictEqual(card.querySelector('.card-footer').textContent, 'Updated now');
    assert.ok(card.querySelector('.badge.badge-running'));
  });

  it('createBadge should map status to badge style', () => {
    const badge = components.createBadge('failed');

    assert.ok(badge.classList.contains('badge'));
    assert.ok(badge.classList.contains('badge-failed'));
    assert.strictEqual(badge.textContent, 'failed');
  });

  it('createActivityItem should render timeline item structure', () => {
    const item = components.createActivityItem({
      time: '10:12',
      type: 'agent_complete',
      message: 'Agent bd-100 completed'
    });

    assert.ok(item.classList.contains('activity-item'));
    assert.ok(item.querySelector('.activity-icon'));
    assert.strictEqual(item.querySelector('.activity-message').textContent, 'Agent bd-100 completed');
    assert.strictEqual(item.querySelector('.timestamp').textContent, '10:12');
  });

  it('createStatBox should render value and label', () => {
    const stat = components.createStatBox({
      label: 'Agents running',
      value: 4,
      trend: 'up'
    });

    assert.ok(stat.classList.contains('stat-box'));
    assert.strictEqual(stat.querySelector('.stat-value').textContent, '4');
    assert.strictEqual(stat.querySelector('.stat-label').textContent, 'Agents running');
    assert.ok(stat.querySelector('.stat-trend.trend-up'));
  });

  it('createLoadingSkeleton should return type-specific skeleton classes', () => {
    const skeleton = components.createLoadingSkeleton('title');

    assert.ok(skeleton.classList.contains('skeleton'));
    assert.ok(skeleton.classList.contains('skeleton-title'));
  });

  it('createConfirmDialog should run confirm callback and close on confirm', () => {
    let confirmed = false;
    const dialog = components.createConfirmDialog({
      title: 'Kill agent?',
      message: 'This action is irreversible.',
      onConfirm: () => {
        confirmed = true;
      }
    });

    document.body.appendChild(dialog);
    const confirmButton = dialog.querySelector('.btn-danger');
    confirmButton.click();

    assert.strictEqual(confirmed, true);
    assert.strictEqual(document.body.contains(dialog), false);
  });

  it('createToast should append toast and auto-remove after duration', async () => {
    const toast = components.createToast({
      message: 'Saved successfully',
      type: 'success',
      duration: 10
    });

    assert.ok(toast.classList.contains('toast'));
    assert.ok(toast.classList.contains('toast-success'));
    assert.strictEqual(document.querySelector('#toast-container').children.length, 1);

    await new Promise(resolve => setTimeout(resolve, 25));
    assert.strictEqual(document.querySelector('#toast-container').children.length, 0);
  });

  it('createBottomSheet should open and close with body scroll lock', async () => {
    const sheet = components.createBottomSheet({
      title: 'Bead details',
      content: 'Sheet content'
    });

    sheet.open();
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.ok(document.querySelector('.bottom-sheet-overlay'));
    assert.ok(document.body.classList.contains('sheet-open'));
    assert.ok(document.querySelector('.bottom-sheet').textContent.includes('Sheet content'));

    sheet.close();
    await new Promise(resolve => setTimeout(resolve, 250));

    assert.strictEqual(document.querySelector('.bottom-sheet-overlay'), null);
    assert.strictEqual(document.body.classList.contains('sheet-open'), false);
  });
});
