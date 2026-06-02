import AsyncStorage from '@react-native-async-storage/async-storage';

// =========================================================================
// CONFIGURATION: EDIT THIS URL TO MATCH YOUR RUNNING PORTAL ENDPOINT
// =========================================================================
export const HARDCODED_BACKEND_URL = 'https://testportal.garudclasses.com/api';

const KEYS = {
  BACKEND_URL: 'garud_omr_backend_url',
  AUTH_TOKEN: 'garud_omr_auth_token',
  USER_INFO: 'garud_omr_user_info',
  DOWNLOADED_TESTS: 'garud_omr_downloaded_tests',
  OFFLINE_QUEUE: 'garud_omr_offline_queue',
};

export default class StorageService {
  // --- Backend Settings ---
  static async getBackendUrl() {
    return HARDCODED_BACKEND_URL;
  }

  static async setBackendUrl(url) {
    return true;
  }

  // --- Auth Token & Credentials ---
  static async getAuthToken() {
    try {
      return await AsyncStorage.getItem(KEYS.AUTH_TOKEN);
    } catch {
      return null;
    }
  }

  static async setAuthToken(token) {
    try {
      if (token) {
        await AsyncStorage.setItem(KEYS.AUTH_TOKEN, token);
      } else {
        await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
      }
      return true;
    } catch {
      return false;
    }
  }

  static async getUserInfo() {
    try {
      const info = await AsyncStorage.getItem(KEYS.USER_INFO);
      return info ? JSON.parse(info) : null;
    } catch {
      return null;
    }
  }

  static async setUserInfo(info) {
    try {
      if (info) {
        await AsyncStorage.setItem(KEYS.USER_INFO, JSON.stringify(info));
      } else {
        await AsyncStorage.removeItem(KEYS.USER_INFO);
      }
      return true;
    } catch {
      return false;
    }
  }

  static async clearSession() {
    try {
      await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
      await AsyncStorage.removeItem(KEYS.USER_INFO);
      return true;
    } catch {
      return false;
    }
  }

  // --- Downloaded Tests ---
  static async getDownloadedTests() {
    try {
      const data = await AsyncStorage.getItem(KEYS.DOWNLOADED_TESTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static async saveDownloadedTest(test) {
    try {
      const tests = await this.getDownloadedTests();
      // Remove duplicate if it exists
      const filtered = tests.filter((t) => t._id !== test._id);
      filtered.push(test);
      await AsyncStorage.setItem(KEYS.DOWNLOADED_TESTS, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  static async deleteDownloadedTest(testId) {
    try {
      const tests = await this.getDownloadedTests();
      const filtered = tests.filter((t) => t._id !== testId);
      await AsyncStorage.setItem(KEYS.DOWNLOADED_TESTS, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  // --- Offline Scanned Queue ---
  static async getOfflineQueue() {
    try {
      const queue = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
      return queue ? JSON.parse(queue) : [];
    } catch {
      return [];
    }
  }

  static async addToQueue(record) {
    try {
      const queue = await this.getOfflineQueue();
      // Record consists of student roll number, scanned answers, test details, marks
      // Filter out duplicate attempts for same test + same roll number to record most recent scan
      const filtered = queue.filter(
        (r) => !(r.testId === record.testId && r.rollNo === record.rollNo)
      );
      filtered.push({
        ...record,
        id: record.id || `${record.testId}_${record.rollNo}_${Date.now()}`,
        scannedAt: record.scannedAt || new Date().toISOString(),
      });
      await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  static async deleteFromQueue(recordId) {
    try {
      const queue = await this.getOfflineQueue();
      const filtered = queue.filter((r) => r.id !== recordId);
      await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  static async deleteTestScansFromQueue(testId) {
    try {
      const queue = await this.getOfflineQueue();
      const filtered = queue.filter((r) => r.testId !== testId);
      await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  static async clearQueue() {
    try {
      await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify([]));
      return true;
    } catch {
      return false;
    }
  }
}
