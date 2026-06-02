import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import StorageService from '../services/StorageService';
import ApiService from '../services/ApiService';

const { width } = Dimensions.get('window');

export default function QueueScreen({ navigation }) {
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadQueueAndSession();
  }, []);

  const loadQueueAndSession = async () => {
    const list = await StorageService.getOfflineQueue();
    const userInfo = await StorageService.getUserInfo();
    setQueue(list);
    setUser(userInfo);
  };

  const handleDeleteRecord = async (recordId) => {
    Alert.alert(
      'Delete Scan Record',
      'Are you sure you want to delete this scanned result from queue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteFromQueue(recordId);
            const updated = queue.filter(r => r.id !== recordId);
            setQueue(updated);
          },
        },
      ]
    );
  };

  const handleClearAll = async () => {
    if (queue.length === 0) return;
    
    Alert.alert(
      'Clear All Queue',
      'Are you sure you want to completely erase all scanned marks from offline queue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase All',
          style: 'destructive',
          onPress: async () => {
            await StorageService.clearQueue();
            setQueue([]);
          },
        },
      ]
    );
  };

  // --- Export Queue Results as CSV ---
  const exportQueueAsCsv = async () => {
    if (queue.length === 0) {
      Alert.alert('Empty Queue', 'There are no pending results to export');
      return;
    }

    let csv = 'Roll Number,Test ID,Test Name,Total Score,Max Score,Correct,Incorrect,Scanned At\n';
    queue.forEach((r) => {
      const escapedName = r.testName ? r.testName.replace(/"/g, '""') : '';
      csv += `"${r.rollNo}","${r.testId}","${escapedName}",${r.totalScore},${r.maxScore},${r.correctCount || 0},${r.incorrectCount || 0},"${r.scannedAt}"\n`;
    });

    try {
      await Share.share({
        title: 'Garud OMR Scanned Marks Export',
        message: csv,
      });
    } catch (err) {
      Alert.alert('Export Failed', err.message);
    }
  };

  // --- Bulk Sync Queue to Backend ---
  const handleSyncQueue = async () => {
    if (queue.length === 0) {
      Alert.alert('Empty Queue', 'There are no pending results to upload');
      return;
    }

    setSyncing(true);
    try {
      // Group offline queue items by testId
      const groups = queue.reduce((acc, item) => {
        if (!acc[item.testId]) {
          acc[item.testId] = [];
        }
        acc[item.testId].push(item);
        return acc;
      }, {});

      let totalImported = 0;
      const allSkipped = [];
      const successfullySyncedIds = [];

      // Loop through each test group and upload in bulk
      for (const testId of Object.keys(groups)) {
        const groupRecords = groups[testId];
        
        // Structure payload matching backend expectations
        const payload = groupRecords.map((r) => ({
          rollNo: r.rollNo,
          answers: r.answers,
        }));

        const res = await ApiService.uploadBulkMarks(testId, payload);
        
        if (res.success) {
          totalImported += res.imported.length;
          
          if (res.skipped && res.skipped.length > 0) {
            allSkipped.push(...res.skipped);
          }

          // Record IDs that were successfully imported or skipped (so we clear them)
          // We can remove them from queue. Skipped ones could either be kept or cleared.
          // To keep it clean, we clear all synced ones from mobile queue, and inform skipped.
          const importedRolls = new Set(res.imported.map(i => i.rollNo));
          const skippedRolls = new Set(res.skipped.map(s => s.rollNo));

          groupRecords.forEach((r) => {
            if (importedRolls.has(r.rollNo) || skippedRolls.has(r.rollNo)) {
              successfullySyncedIds.push(r.id);
            }
          });
        }
      }

      // Remove successfully synced IDs from storage queue
      for (const id of successfullySyncedIds) {
        await StorageService.deleteFromQueue(id);
      }

      // Refresh local queue
      const remainingQueue = await StorageService.getOfflineQueue();
      setQueue(remainingQueue);

      // Report Sync Summary
      let msg = `Successfully uploaded ${totalImported} student marks to backend!`;
      if (allSkipped.length > 0) {
        msg += `\n\nSkipped ${allSkipped.length} student scans because their Roll Numbers are not registered in backend:`;
        allSkipped.forEach((s) => {
          msg += `\n- Roll No ${s.rollNo}: ${s.reason}`;
        });
      }

      Alert.alert('Sync Completed', msg);
    } catch (err) {
      Alert.alert('Sync Failed', err.message || 'Check network connection and backend endpoint settings');
    } finally {
      setSyncing(false);
    }
  };

  // Group queue by testName for visual lists
  const groupedQueue = queue.reduce((acc, item) => {
    const key = item.testName;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Scanned Marks Queue</Text>
          <Text style={styles.subtitle}>
            Manage and upload locally-scanned OMR answers to the Garud portal.
          </Text>
        </View>
        
        {queue.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
            <Text style={styles.clearBtnText}>Erase All</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {queue.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyHeading}>Queue is empty</Text>
            <Text style={styles.emptyText}>
              Scanned OMR results will appear here. Select a test, take photos of sheets, and they'll compile ready to upload.
            </Text>
          </View>
        ) : (
          <View style={styles.queueGroups}>
            {Object.keys(groupedQueue).map((testName) => (
              <View key={testName} style={styles.groupCard}>
                <Text style={styles.groupTitle}>{testName}</Text>
                
                {groupedQueue[testName].map((record) => (
                  <View key={record.id} style={styles.recordRow}>
                    <View style={styles.recordMeta}>
                      <Text style={styles.rollText}>Roll Number: {record.rollNo}</Text>
                      <Text style={styles.scoreText}>
                        Graded Score: <Text style={styles.scoreVal}>{record.totalScore} / {record.maxScore}</Text>
                      </Text>
                      <Text style={styles.dateText}>
                        Scanned at: {new Date(record.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteRecordBtn}
                      onPress={() => handleDeleteRecord(record.id)}
                    >
                      <Text style={styles.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Upload Syncer Glowing Footer */}
      {queue.length > 0 && (
        <View style={styles.footerSync}>
          <View style={styles.syncStats}>
            <Text style={styles.syncStatsText}>{queue.length} Scans</Text>
            <Text style={styles.syncMetaText}>
              Offline Marks Sync Enabled
            </Text>
          </View>
          
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={exportQueueAsCsv}
            >
              <Text style={styles.exportBtnText}>Share CSV</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.syncBtn}
              onPress={handleSyncQueue}
              disabled={syncing}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.syncBtnText}>Sync Upload</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginTop: 4,
    maxWidth: width * 0.65,
  },
  clearBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearBtnText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: 24,
    paddingBottom: 120,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#38bdf8',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  queueGroups: {
    gap: 20,
  },
  groupCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#818cf8',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 8,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.8,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  recordMeta: {
    flex: 1,
  },
  rollText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  scoreText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  scoreVal: {
    fontWeight: 'bold',
    color: '#38bdf8',
  },
  dateText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  deleteRecordBtn: {
    padding: 8,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  footerSync: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: '#0f172a',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  syncStats: {
    flex: 1,
  },
  syncStatsText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  syncMetaText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  syncBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBtnDisabled: {
    backgroundColor: '#334155',
    opacity: 0.5,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  exportBtn: {
    backgroundColor: 'transparent',
    borderColor: '#38bdf8',
    borderWidth: 1.2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
});
