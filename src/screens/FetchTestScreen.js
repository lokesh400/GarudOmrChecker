import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ApiService from '../services/ApiService';
import StorageService from '../services/StorageService';

export default function FetchTestScreen({ user, onLogout }) {
  // Tests List State
  const [tests, setTests] = useState([]);
  const [downloadIds, setDownloadIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    const localTests = await StorageService.getDownloadedTests();
    setDownloadIds(localTests.map((t) => t._id));

    setLoading(true);
    try {
      const list = await ApiService.getPublishedTests();
      setTests(list);
    } catch {
      // Silent catch on autostart in case endpoint is inactive
    } finally {
      setLoading(false);
    }
  };

  const fetchTests = async () => {
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
        {/* Welcome back / Logout Card */}
        {user && (
          <View style={styles.card}>
            <View style={styles.userRow}>
              <View>
                <Text style={styles.userWelcome}>Authenticated Staff,</Text>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userRole}>{user.role.toUpperCase()} ACCESS</Text>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
                <Text style={styles.logoutBtnText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tests Downloader Section */}
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
