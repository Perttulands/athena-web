import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { request, assertResponse } from './setup.js';

describe('Test Setup Helpers', () => {
  it('request returns skipped result when app cannot listen', async () => {
    const app = {
      listen() {
        const error = new Error('listen failed');
        error.code = 'EACCES';
        throw error;
      }
    };

    const result = await request(app, '/api/health');

    assert.equal(result.skipped, true);
    assert.equal(result.status, null);
    assert.equal(result.response, null);
    assert.equal(result.data, null);
  });

  it('assertResponse accepts successful results without skipped flag', () => {
    assert.doesNotThrow(() => {
      assertResponse({ status: 200, data: { status: 'ok' } }, 200, { status: 'ok' });
    });
  });
});
