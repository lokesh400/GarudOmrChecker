import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ApiService from '../services/ApiService';
import StorageService from '../services/StorageService';

export default function FetchTestScreen() {
  // Settings & Authentication
  const [backendUrl, setBackendUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  
  // Tests List State
  const [tests, setTests] = useState([]);
  const [downloadIds, setDownloadIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSettingsAndSession();
  }, []);

  const loadSettingsAndSession = async () => {
    const url = await StorageService.getBackendUrl();
    const userInfo = await StorageService.getUserInfo();
    const localTests = await StorageService.getDownloadedTests();

    setBackendUrl(url);
    setUser(userInfo);
    setDownloadIds(localTests.map((t) => t._id));

    if (url) {
      setLoading(true);
      try {
        const list = await ApiService.getPublishedTests();
        setTests(list);
      } catch {
        // Silent catch on autostart in case endpoint is inactive
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSaveUrl = async () => {
    if (!backendUrl.trim()) return;
    const success = await StorageService.setBackendUrl(backendUrl);
    if (success) {
      Alert.alert('Success', 'Backend URL saved successfully');
      fetchTests(); // Refresh tests lists from the new endpoint
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const res = await ApiService.login(email, password);
      const loggedUser = res.user;

      if (loggedUser.role !== 'admin' && loggedUser.role !== 'coordinator') {
        // Logout immediately to clear session token if they aren't authorized
        await StorageService.clearSession();
        setUser(null);
        setTests([]);
        Alert.alert('Access Denied', 'Only Admins or Coordinators can access this sync portal.');
        return;
      }

      setUser(loggedUser);
      Alert.alert('Success', `Logged in as ${loggedUser.name}`);
      
      // Fetch tests using the updated session cookie
      setLoading(true);
      const list = await ApiService.getPublishedTests();
      setTests(list);
    } catch (err) {
      Alert.alert('Login Failed', err.message || 'Check credentials and backend URL');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await StorageService.clearSession();
    setUser(null);
    setTests([]);
  };

  const fetchTests = async () => {
    if (!user || (user.role !== 'admin' && user.role !== 'coordinator')) {
      Alert.alert('Access Denied', 'Please log in with an Admin or Coordinator account first.');
      return;
    }
    setLoading(true);
    try {
      const list = await ApiService.getPublishedTests();
      setTests(list);
    } catch (err) {
      Alert.alert('Error', 'Failed to fetch tests: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (testId) => {
    setActionLoading(testId);
    try {
      // 1. Fetch detailed test layout including questions keys
      const testDetail = await ApiService.getTestDetails(testId);
      
      // 2. Save detailed test offline
      await StorageService.saveDownloadedTest(testDetail);

      // Update state
      setDownloadIds((prev) => [...prev, testId]);
      Alert.alert('Success', `Test downloaded successfully for offline scanning!`);
    } catch (err) {
      Alert.alert('Download Failed', err.message || 'Something went wrong');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteOffline = async (testId) => {
    Alert.alert(
      'Delete Offline Test',
      'Are you sure you want to delete this test from mobile storage?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteDownloadedTest(testId);
            setDownloadIds((prev) => prev.filter((id) => id !== testId));
          },
        },
      ]
    );
  };

  const filteredTests = tests.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isAuthorized = user && (user.role === 'admin' || user.role === 'coordinator');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Backend & Tests Sync</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Backend Configuration Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backend Endpoint URL</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={backendUrl}
              onChangeText={setBackendUrl}
              placeholder="e.g. http://192.168.1.XX:3000/api"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Authentication Card */}
        {!user ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sync Portal Login</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Admin or Coordinator Email"
              placeholderTextColor="#64748b"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#64748b"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
              <Text style={styles.loginBtnText}>{loading ? 'Authenticating...' : 'Log In'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.userRow}>
              <View>
                <Text style={styles.userWelcome}>Welcome back,</Text>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userRole}>{user.role.toUpperCase()} ACCESS</Text>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Text style={styles.logoutBtnText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tests Downloader Section (Only visible for authorized admin/coordinators) */}
        {isAuthorized ? (
          <View style={styles.testsSection}>
            <View style={styles.testsHeader}>
              <Text style={styles.sectionTitle}>Available Tests</Text>
              <TouchableOpacity onPress={fetchTests} disabled={loading}>
                <Text style={styles.refreshText}>{loading ? 'Refreshing...' : 'Refresh List'}</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search test paper by title..."
              placeholderTextColor="#64748b"
            />

            {loading && tests.length === 0 ? (
              <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#38bdf8" />
            ) : (
              <View style={styles.listContainer}>
                {filteredTests.length === 0 ? (
                  <Text style={styles.emptyText}>No published tests found.</Text>
                ) : (
                  filteredTests.map((item) => {
                    const isDownloaded = downloadIds.includes(item._id);
                    const isLoading = actionLoading === item._id;

                    return (
                      <View key={item._id} style={styles.testItem}>
                        <View style={styles.testMeta}>
                          <Text style={styles.testName} numberOfLines={2}>{item.name}</Text>
                          <View style={styles.badgesRow}>
                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>{item.totalQuestions} Questions</Text>
                            </View>
                            <View style={[styles.badge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                              <Text style={[styles.badgeText, { color: '#818cf8' }]}>{item.duration} Mins</Text>
                            </View>
                            {isDownloaded && (
                              <View style={[styles.badge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                                <Text style={[styles.badgeText, { color: '#10b981' }]}>Offline Ready</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        
                        <View style={styles.actionsCell}>
                          {isLoading ? (
                            <ActivityIndicator size="small" color="#38bdf8" />
                          ) : !isDownloaded ? (
                            <TouchableOpacity
                              style={styles.downloadBtn}
                              onPress={() => handleDownload(item._id)}
                            >
                              <Text style={styles.downloadBtnText}>Sync Offline</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={styles.deleteBtn}
                              onPress={() => handleDeleteOffline(item._id)}
                            >
                              <Text style={styles.deleteBtnText}>Remove</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Please log in with Admin or Coordinator credentials to sync offline tests.</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  loginBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userWelcome: {
    fontSize: 12,
    color: '#94a3b8',
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginTop: 2,
  },
  userRole: {
    fontSize: 10,
    color: '#38bdf8',
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  testsSection: {
    marginTop: 8,
  },
  testsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  refreshText: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  listContainer: {
    gap: 12,
  },
  testItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  testMeta: {
    flex: 1,
    marginRight: 12,
  },
  testName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  badge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    color: '#38bdf8',
    fontWeight: 'bold',
  },
  actionsCell: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  downloadBtn: {
    backgroundColor: '#38bdf8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  downloadBtnText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14,
    marginTop: 20,
  },
});
