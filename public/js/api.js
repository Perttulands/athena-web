// API client - thin fetch wrapper with uniform error handling

class ApiClient {
  constructor() {
    this.baseUrl = '/api';
  }

  async get(path) {
    return this.request(path, { method: 'GET' });
  }

  async post(path, body) {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async put(path, body) {
    return this.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async request(path, options) {
    const url = this.baseUrl + path;

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        // Try to get error message from JSON response
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // If JSON parsing fails, use statusText
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      // Re-throw with error message
      throw error;
    }
  }
}

// Export singleton instance
const api = typeof window !== 'undefined' ? new ApiClient() : null;
export default api;
