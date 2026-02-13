import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

describe('API Client', () => {
  let api;
  let fetchMock;
  let originalFetch;

  before(async () => {
    // Setup DOM
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost:9000'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;

    // Mock fetch
    originalFetch = global.fetch;
    fetchMock = {
      responses: [],
      calls: [],
      mockResponse(response) {
        this.responses.push(response);
      },
      reset() {
        this.responses = [];
        this.calls = [];
      }
    };

    global.fetch = async (url, options) => {
      fetchMock.calls.push({ url, options });
      const response = fetchMock.responses.shift();
      if (!response) {
        throw new Error('No mock response configured');
      }
      return response;
    };

    // Import module after globals are set
    const module = await import('../../public/js/api.js?t=' + Date.now());
    api = module.default;
  });

  beforeEach(() => {
    fetchMock.reset();
  });

  after(() => {
    global.fetch = originalFetch;
    delete global.window;
    delete global.document;
    delete global.location;
  });

  it('should construct correct URL for GET request', async () => {
    fetchMock.mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' })
    });

    await api.get('/test');

    assert.strictEqual(fetchMock.calls.length, 1);
    assert.strictEqual(fetchMock.calls[0].url, '/api/test');
    assert.strictEqual(fetchMock.calls[0].options.method, 'GET');
  });

  it('should construct correct URL for POST request', async () => {
    fetchMock.mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    });

    await api.post('/test', { name: 'value' });

    assert.strictEqual(fetchMock.calls.length, 1);
    assert.strictEqual(fetchMock.calls[0].url, '/api/test');
    assert.strictEqual(fetchMock.calls[0].options.method, 'POST');
    assert.strictEqual(fetchMock.calls[0].options.headers['Content-Type'], 'application/json');
    assert.strictEqual(fetchMock.calls[0].options.body, JSON.stringify({ name: 'value' }));
  });

  it('should construct correct URL for PUT request', async () => {
    fetchMock.mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ saved: true })
    });

    await api.put('/docs/test.md', { content: 'hello' });

    assert.strictEqual(fetchMock.calls.length, 1);
    assert.strictEqual(fetchMock.calls[0].url, '/api/docs/test.md');
    assert.strictEqual(fetchMock.calls[0].options.method, 'PUT');
    assert.strictEqual(fetchMock.calls[0].options.headers['Content-Type'], 'application/json');
  });

  it('should return parsed JSON on success', async () => {
    fetchMock.mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test', count: 42 })
    });

    const result = await api.get('/test');

    assert.deepStrictEqual(result, { data: 'test', count: 42 });
  });

  it('should throw error with message on API error', async () => {
    fetchMock.mockResponse({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found', status: 404 })
    });

    await assert.rejects(
      async () => await api.get('/nonexistent'),
      (error) => {
        assert.strictEqual(error.message, 'Not found');
        return true;
      }
    );
  });

  it('should throw error on network failure', async () => {
    global.fetch = async () => {
      throw new Error('Network error');
    };

    await assert.rejects(
      async () => await api.get('/test'),
      (error) => {
        assert.strictEqual(error.message, 'Network error');
        return true;
      }
    );

    // Restore mock
    global.fetch = async (url, options) => {
      fetchMock.calls.push({ url, options });
      const response = fetchMock.responses.shift();
      if (!response) {
        throw new Error('No mock response configured');
      }
      return response;
    };
  });

  it('should handle non-JSON response errors', async () => {
    fetchMock.mockResponse({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Not JSON');
      },
      statusText: 'Internal Server Error'
    });

    await assert.rejects(
      async () => await api.get('/broken'),
      (error) => {
        assert.strictEqual(error.message, 'Internal Server Error');
        return true;
      }
    );
  });
});
