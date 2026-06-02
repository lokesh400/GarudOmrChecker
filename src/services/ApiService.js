import StorageService from './StorageService';

export default class ApiService {
  static async request(endpoint, options = {}) {
    const baseUrl = await StorageService.getBackendUrl();
    const cookie = await StorageService.getAuthToken(); // stored cookie string e.g. "sid=..."

    const url = `${baseUrl}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);
      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        throw new Error("Server returned HTML/text instead of JSON. Ensure your Backend Endpoint URL is correct and includes the '/api' suffix (e.g. http://192.168.1.XX:3000/api).");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`[API ERROR] ${endpoint}:`, error);
      throw error;
    }
  }

  static async login(email, password) {
    try {
      // Use the mobile login endpoint
      const response = await this.request('/auth/m/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const { cookie, user } = response;

      // Save cookie token and user info
      if (cookie) {
        await StorageService.setAuthToken(cookie);
      }
      if (user) {
        await StorageService.setUserInfo(user);
      }

      return response;
    } catch (error) {
      throw error;
    }
  }

  static async getPublishedTests() {
    try {
      // Primary: new public auth-free listing route
      return await this.request('/tests/public/list');
    } catch {
      try {
        // Fallback 1: Secure student listing
        return await this.request('/tests/published');
      } catch {
        // Fallback 2: Custom portal/generic routes
        return await this.request('/tests');
      }
    }
  }

  static async getTestDetails(testId) {
    try {
      // Primary: new public auth-free layout downloader
      const response = await this.request(`/tests/public/${testId}`);
      return response.test || response;
    } catch {
      try {
        // Fallback 1: Admin secure downloader
        const response = await this.request(`/tests/admin/${testId}`);
        return response.test || response;
      } catch {
        // Fallback 2: Custom portal/generic details route
        const response = await this.request(`/tests/${testId}`);
        return response.test || response;
      }
    }
  }

  static async uploadBulkMarks(testId, results) {
    try {
      // Primary: new public auth-free bulk submit route
      return await this.request('/tests/public/submit-marks', {
        method: 'POST',
        body: JSON.stringify({ testId, results }),
      });
    } catch {
      try {
        // Fallback 1: Secure endpoint
        return await this.request(`/tests/${testId}/bulk-submit`, {
          method: 'POST',
          body: JSON.stringify({ results }),
        });
      } catch {
        // Fallback 2: Generic submission
        return await this.request(`/tests/${testId}/submit-marks`, {
          method: 'POST',
          body: JSON.stringify({ results }),
        });
      }
    }
  }
}
