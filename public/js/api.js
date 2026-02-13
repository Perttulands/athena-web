// API client - thin fetch wrapper with uniform error handling + short-lived cache.

class ApiClient {
  constructor() {
    this.baseUrl = '/api';
    this.cache = new Map();
    this.cacheTtlMs = 5000;
  }

  cacheKey(path) {
    return `${this.baseUrl}${path}`;
  }

  clearCache() {
    this.cache.clear();
  }

  getCached(path) {
    const key = this.cacheKey(path);
    const hit = this.cache.get(key);
    if (!hit) return null;

    const age = Date.now() - hit.createdAt;
    if (age > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return hit.value;
  }

  setCached(path, value) {
    const key = this.cacheKey(path);
    this.cache.set(key, {
      value,
      createdAt: Date.now()
    });
  }

  async get(path) {
    const cached = this.getCached(path);
    if (cached !== null) {
      return cached;
    }

    const response = await this.request(path, { method: 'GET' });
    this.setCached(path, response);
    return response;
  }

  async post(path, body) {
    this.clearCache();
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async put(path, body) {
    this.clearCache();
    return this.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async request(path, options) {
    const url = this.baseUrl + path;

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        if (errorData?.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // fall back to statusText
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }
}

// Export singleton instance
const api = typeof window !== 'undefined' ? new ApiClient() : null;
export default api;
