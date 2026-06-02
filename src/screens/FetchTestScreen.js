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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import ApiService from '../services/ApiService';
import StorageService from '../services/StorageService';

export default function FetchTestScreen({ user, onLogout }) {
  // Tests List State
  const [tests, setTests] = useState([]);
  const [downloadIds, setDownloadIds] = useState([]);
  const [offlineTests, setOfflineTests] = useState([]);
  const [localScans, setLocalScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSession();
  }, []);

  const loadOfflineData = async () => {
    try {
      const local = await StorageService.getDownloadedTests();
      setOfflineTests(local);
      setDownloadIds(local.map((t) => t._id));
      const scans = await StorageService.getOfflineQueue();
      setLocalScans(scans);
    } catch (err) {
      console.error('[LOAD OFFLINE DATA ERROR]:', err);
    }
  };

  const loadSession = async () => {
    await loadOfflineData();

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
      await loadOfflineData();
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

      // Update offline state
      await loadOfflineData();
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
            await StorageService.deleteTestScansFromQueue(testId);
            await loadOfflineData();
          },
        },
      ]
    );
  };

  const handleExportLocal = async (testId, format) => {
    const offlineTestDetail = offlineTests.find(t => t._id === testId);
    if (!offlineTestDetail) {
      Alert.alert('Offline Data Missing', 'Offline test layout not found. Please sync/download the test offline first!');
      return;
    }

    const scansForTest = localScans.filter((s) => s.testId === testId);
    if (scansForTest.length === 0) {
      Alert.alert('No Scans Found', 'There are no graded offline OMR scans saved for this test yet. Go to the Scan tab to check sheets first!');
      return;
    }

    try {
      // Sort scans by totalScore descending for leaderboard ranks
      const sortedScans = [...scansForTest].sort((a, b) => b.totalScore - a.totalScore);
      const testSections = offlineTestDetail.sections || [];

      const rowsData = sortedScans.map((r, index) => {
        const studentName = `Student Roll ${r.rollNo}`;
        const studentEmail = `${r.rollNo}@garud.com`;
        const rollNo = r.rollNo || '—';
        const batchName = 'Offline';

        const sectionStats = {};
        let totalCorrect = 0;
        let totalIncorrect = 0;
        let totalAttempted = 0;
        let totalPositive = 0;
        let totalNegative = 0;

        testSections.forEach((sec) => {
          const secIdStr = sec._id.toString();
          let secCorrect = 0;
          let secIncorrect = 0;
          let secAttempted = 0;
          let secPositiveScore = 0;
          let secNegativeScore = 0;

          sec.questions.forEach((qEntry) => {
            const qIdStr = qEntry.question?._id ? qEntry.question._id.toString() : (qEntry.question || '').toString();
            const ans = (r.answers || []).find(a => 
              a.questionId && a.questionId.toString() === qIdStr &&
              a.sectionId && a.sectionId.toString() === secIdStr
            );

            if (ans) {
              const isAttempt = !!(
                ans.selectedOption && ans.selectedOption !== '-' && ans.selectedOption !== ''
              );

              if (isAttempt) {
                secAttempted++;
                if (ans.isCorrect) {
                  secCorrect++;
                  secPositiveScore += qEntry.positiveMarks || 4;
                } else {
                  secIncorrect++;
                  secNegativeScore += qEntry.negativeMarks || 1;
                }
              }
            }
          });

          totalCorrect += secCorrect;
          totalIncorrect += secIncorrect;
          totalAttempted += secAttempted;
          totalPositive += secPositiveScore;
          totalNegative += secNegativeScore;

          sectionStats[sec.name] = {
            correct: secCorrect,
            incorrect: secIncorrect,
            attempted: secAttempted,
            score: secPositiveScore - secNegativeScore
          };
        });

        const rawScore = r.totalScore;
        const maxScore = r.maxScore || 0;
        const pct = maxScore > 0 ? ((rawScore / maxScore) * 100).toFixed(2) : '0.00';

        return {
          rank: index + 1,
          studentName,
          studentEmail,
          rollNo,
          batchName,
          sectionStats,
          totalCorrect,
          totalIncorrect,
          totalAttempted,
          totalPositive,
          totalNegative,
          rawScore,
          maxScore,
          pct
        };
      });

      if (format === 'csv') {
        let csvHeader = 'Rank,Roll Number,Student Name,Email,Batch';
        testSections.forEach(sec => {
          csvHeader += `,${sec.name} Correct,${sec.name} Incorrect,${sec.name} Attempted,${sec.name} Score`;
        });
        csvHeader += ',Total Correct,Total Incorrect,Total Attempted,Total Positive Marks,Total Negative Marks,Raw Score,Max Score,Percentage (%)\n';

        let csvContent = csvHeader;
        rowsData.forEach(row => {
          let line = `"${row.rank}","${row.rollNo}","${row.studentName}","${row.studentEmail}","${row.batchName}"`;
          testSections.forEach(sec => {
            const stats = row.sectionStats[sec.name];
            line += `,"${stats.correct}","${stats.incorrect}","${stats.attempted}","${stats.score}"`;
          });
          line += `,"${row.totalCorrect}","${row.totalIncorrect}","${row.totalAttempted}","${row.totalPositive}","${row.totalNegative}","${row.rawScore}","${row.maxScore}","${row.pct}"\n`;
          csvContent += line;
        });

        const filename = `results-${offlineTestDetail.name.replace(/\s+/g, '_')}.csv`;
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Export CSV Results' });
      } else if (format === 'excel') {
        let html = `
          <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <style>
              table { border-collapse: collapse; font-family: sans-serif; font-size: 10pt; }
              td, th { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; }
              .header-title { background-color: #1e3a8a; color: #ffffff; font-size: 14pt; font-weight: bold; height: 35px; text-align: left; }
              .meta-row { background-color: #f8fafc; font-size: 9pt; color: #64748b; text-align: left; }
              .col-hdr { background-color: #334155; color: #ffffff; font-weight: bold; }
              .sec-hdr { background-color: #475569; color: #ffffff; font-weight: bold; }
              .rank-1 { background-color: #fef08a; font-weight: bold; }
              .rank-2 { background-color: #f3f4f6; font-weight: bold; }
              .rank-3 { background-color: #ffedd5; font-weight: bold; }
              .stat-correct { background-color: #dcfce7; color: #15803d; }
              .stat-incorrect { background-color: #fee2e2; color: #b91c1c; }
              .stat-attempted { background-color: #faf5ff; color: #6b21a8; }
              .stat-score { background-color: #f8fafc; font-weight: bold; }
              .overall-cell { background-color: #eff6ff; font-weight: bold; }
              .text-left { text-align: left; }
            </style>
          </head>
          <body>
            <table>
              <tr>
                <th colspan="${5 + testSections.length * 4 + 8}" class="header-title">🦅 GARUD CLASSES — OMR TEST RESULTS LEADERBOARD</th>
              </tr>
              <tr class="meta-row">
                <td colspan="${5 + testSections.length * 4 + 8}">
                  <strong>Test Name:</strong> ${offlineTestDetail.name} | 
                  <strong>Exported At:</strong> ${new Date().toLocaleString()} | 
                  <strong>Total Scans:</strong> ${rowsData.length}
                </td>
              </tr>
              <tr>
                <th rowspan="2" class="col-hdr">Rank</th>
                <th rowspan="2" class="col-hdr">Roll Number</th>
                <th rowspan="2" class="col-hdr">Student Name</th>
                <th rowspan="2" class="col-hdr">Email</th>
                <th rowspan="2" class="col-hdr">Batch</th>
        `;

        testSections.forEach(sec => {
          html += `<th colspan="4" class="sec-hdr">${sec.name}</th>`;
        });

        html += `
                <th colspan="8" class="col-hdr" style="background-color: #1d4ed8;">Overall Performance Summary</th>
              </tr>
              <tr>
        `;

        testSections.forEach(() => {
          html += `
            <th class="col-hdr">Correct</th>
            <th class="col-hdr">Incorrect</th>
            <th class="col-hdr">Attempted</th>
            <th class="col-hdr">Score</th>
          `;
        });

        html += `
                <th class="col-hdr" style="background-color: #1e40af;">Total Correct</th>
                <th class="col-hdr" style="background-color: #1e40af;">Total Incorrect</th>
                <th class="col-hdr" style="background-color: #1e40af;">Total Attempted</th>
                <th class="col-hdr" style="background-color: #1e40af;">Positive Marks</th>
                <th class="col-hdr" style="background-color: #b91c1c;">Negative Marks</th>
                <th class="col-hdr" style="background-color: #1e40af;">Raw Score</th>
                <th class="col-hdr" style="background-color: #1e40af;">Max Score</th>
                <th class="col-hdr" style="background-color: #1e40af;">Accuracy (%)</th>
              </tr>
        `;

        rowsData.forEach(row => {
          let rankClass = '';
          if (row.rank === 1) rankClass = ' class="rank-1"';
          else if (row.rank === 2) rankClass = ' class="rank-2"';
          else if (row.rank === 3) rankClass = ' class="rank-3"';

          html += `
            <tr>
              <td${rankClass}>${row.rank}</td>
              <td>'${row.rollNo}</td>
              <td class="text-left">${row.studentName}</td>
              <td class="text-left">${row.studentEmail}</td>
              <td>${row.batchName}</td>
          `;

          testSections.forEach(sec => {
            const stats = row.sectionStats[sec.name];
            html += `
              <td class="stat-correct">${stats.correct}</td>
              <td class="stat-incorrect">${stats.incorrect}</td>
              <td class="stat-attempted">${stats.attempted}</td>
              <td class="stat-score">${stats.score}</td>
            `;
          });

          const pctStyle = parseFloat(row.pct) >= 60.0 ? 'color: #166534; background-color: #dcfce7;' : 'color: #991b1b; background-color: #fee2e2;';

          html += `
              <td class="overall-cell">${row.totalCorrect}</td>
              <td class="overall-cell">${row.totalIncorrect}</td>
              <td class="overall-cell">${row.totalAttempted}</td>
              <td class="overall-cell" style="color: #166534;">+${row.totalPositive}</td>
              <td class="overall-cell" style="color: #b91c1c;">-${row.totalNegative}</td>
              <td class="overall-cell" style="font-weight: bold; background-color: #dbeafe;">${row.rawScore}</td>
              <td class="overall-cell">${row.maxScore}</td>
              <td class="overall-cell" style="${pctStyle}">${row.pct}%</td>
            </tr>
          `;
        });

        html += `
            </table>
          </body>
          </html>
        `;

        const filename = `results-${offlineTestDetail.name.replace(/\s+/g, '_')}.xls`;
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, html, { encoding: 'utf8' });
        await Sharing.shareAsync(fileUri, { dialogTitle: 'Export Excel Results' });
      }
    } catch (err) {
      console.error('[EXPORT LOCAL ERROR]:', err);
      Alert.alert('Export Failed', 'An error occurred while compiling offline results: ' + err.message);
    }
  };

  const filteredTests = (tests || []).filter((t) =>
    ((t && t.name) || '').toLowerCase().includes((searchQuery || '').toLowerCase())
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
                    <View key={item._id} style={[styles.testItem, isDownloaded && styles.testItemDownloaded]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
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

                      {isDownloaded && (() => {
                        const scansCount = localScans.filter((s) => s.testId === item._id).length;
                        return (
                          <View style={styles.downloadedDetails}>
                            <Text style={styles.scansCountText}>
                              📊 {scansCount} Graded Offline Sheet{scansCount !== 1 ? 's' : ''}
                            </Text>
                            {scansCount > 0 && (
                              <View style={styles.exportButtonsRow}>
                                <TouchableOpacity
                                  style={styles.exportBtnCsv}
                                  onPress={() => handleExportLocal(item._id, 'csv')}
                                >
                                  <Text style={styles.exportBtnCsvText}>CSV Export</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.exportBtnExcel}
                                  onPress={() => handleExportLocal(item._id, 'excel')}
                                >
                                  <Text style={styles.exportBtnExcelText}>Excel Export</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        );
                      })()}
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
  testItemDownloaded: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(56, 189, 248, 0.15)',
  },
  downloadedDetails: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 12,
    marginTop: 4,
    gap: 10,
  },
  scansCountText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '700',
  },
  exportButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  exportBtnCsv: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBtnCsvText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  exportBtnExcel: {
    flex: 1,
    backgroundColor: '#eab308',
    borderRadius: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBtnExcelText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
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
