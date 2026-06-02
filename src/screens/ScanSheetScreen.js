import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, ScrollView, Image, Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import StorageService from '../services/StorageService';
import { processOmrNative } from '../services/OmrProcessor';

const { width } = Dimensions.get('window');

export default function ScanSheetScreen() {
  const [offlineTests, setOfflineTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);

  // OMR Scan State
  const [scanning, setScanning] = useState(false);
  const [scanImageUri, setScanImageUri] = useState(null);
  const [statusText, setStatusText] = useState('');
  const [processedResult, setProcessedResult] = useState(null);

  // Verification Overlay State
  const [rollNumber, setRollNumber] = useState('');
  const [gradedResult, setGradedResult] = useState(null);
  const [showVerification, setShowVerification] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(null);

  useEffect(() => {
    loadOfflineTests();
    (async () => {
      const s = await Camera.requestCameraPermissionsAsync();
      setCameraPermission(s.status === 'granted');
    })();
  }, []);

  const loadOfflineTests = async () => {
    const list = await StorageService.getDownloadedTests();
    setOfflineTests(list);
    if (list.length > 0) setSelectedTest(list[0]);
  };

  const selectTest = (test) => {
    setSelectedTest(test);
    resetScanState();
  };

  const resetScanState = () => {
    setScanImageUri(null);
    setProcessedResult(null);
    setGradedResult(null);
    setShowVerification(false);
    setRollNumber('');
    setScanning(false);
    setStatusText('');
  };

  // --- Capture / Upload ---
  const pickImageFromGallery = async () => {
    if (!selectedTest) { Alert.alert('Selection Required', 'Please select an offline test first'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        runOmr(result.assets[0].base64, result.assets[0].uri);
      }
    } catch { Alert.alert('Error', 'Failed to load image from gallery'); }
  };

  const captureImageFromCamera = async () => {
    if (!selectedTest) { Alert.alert('Selection Required', 'Please select an offline test first'); return; }
    if (!cameraPermission) { Alert.alert('Permission Denied', 'Camera permission required'); return; }
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0].base64) {
        runOmr(result.assets[0].base64, result.assets[0].uri);
      }
    } catch { Alert.alert('Error', 'Failed to capture photo'); }
  };

  // --- Run pure-JS OMR processing ---
  const runOmr = async (base64, uri) => {
    setScanning(true);
    setScanImageUri(uri);
    setProcessedResult(null);
    setGradedResult(null);
    setShowVerification(false);
    setStatusText('Starting OMR engine...');

    const questionCount = selectedTest.sections.reduce((a, s) => a + s.questions.length, 0);

    const result = await processOmrNative(base64, questionCount, (msg) => setStatusText(msg));

    setScanning(false);
    if (result.success) {
      setProcessedResult(result);
      setRollNumber(result.rollNo);
      gradeAnswers(result.answers, result.rollNo);
    } else {
      Alert.alert('OMR Detection Error', result.error || 'Check alignment markers and lighting');
      resetScanState();
    }
  };

  // --- Grade answers offline ---
  const gradeAnswers = (scannedAnswers, rollNo) => {
    if (!selectedTest) return;
    let totalScore = 0, maxScore = 0, correctCount = 0, incorrectCount = 0, unattemptedCount = 0;
    const details = [];

    selectedTest.sections.forEach((section) => {
      section.questions.forEach((qEntry) => {
        const question = qEntry.question;
        const pos = qEntry.positiveMarks || 4;
        const neg = qEntry.negativeMarks || 1;
        maxScore += pos;
        const totalQNo = details.length + 1;
        const scanned = scannedAnswers.find((a) => a.qNo === totalQNo);
        const sel = scanned ? scanned.selectedOption : null;
        let isCorrect = false, marks = 0;

        if (question.type === 'mcq' || question.type === 'msq') {
          if (sel) {
            isCorrect = sel === question.correctOption;
            marks = isCorrect ? pos : -neg;
            if (isCorrect) correctCount++; else incorrectCount++;
          } else { unattemptedCount++; }
        } else { unattemptedCount++; }

        totalScore += marks;
        details.push({
          qNo: totalQNo, questionId: question._id, sectionId: section._id,
          selectedOption: sel, correctOption: question.correctOption || '-',
          isCorrect, marksObtained: marks,
        });
      });
    });

    const accuracy = correctCount + incorrectCount > 0
      ? Math.round((correctCount / (correctCount + incorrectCount)) * 100) : 0;

    setGradedResult({ totalScore, maxScore, correctCount, incorrectCount, unattemptedCount, accuracy, answers: details });
    setShowVerification(true);
  };

  // --- Save to queue ---
  const saveAttemptToQueue = async () => {
    if (!selectedTest || !gradedResult) return;
    if (rollNumber.includes('?') || rollNumber.length !== 8) {
      Alert.alert('Invalid Roll Number', 'Please enter a valid 8-digit roll number'); return;
    }
    const record = {
      testId: selectedTest._id, testName: selectedTest.name, rollNo: rollNumber.trim(),
      answers: gradedResult.answers.map(a => ({ questionId: a.questionId, sectionId: a.sectionId, selectedOption: a.selectedOption })),
      totalScore: gradedResult.totalScore, maxScore: gradedResult.maxScore,
      correctCount: gradedResult.correctCount, incorrectCount: gradedResult.incorrectCount,
      scannedAt: new Date().toISOString(),
    };
    const ok = await StorageService.addToQueue(record);
    if (ok) Alert.alert('Recorded', `Result saved for Roll: ${rollNumber}!`, [{ text: 'OK', onPress: resetScanState }]);
    else Alert.alert('Error', 'Failed to save');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Test Selector */}
      <View style={styles.selectorHeader}>
        <Text style={styles.selectorLabel}>ACTIVE OFFLINE TEST</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.testSlider}>
          {offlineTests.length === 0 ? (
            <Text style={styles.noTestsText}>No offline tests. Sync tests first!</Text>
          ) : offlineTests.map((t) => (
            <TouchableOpacity key={t._id}
              style={[styles.testTab, selectedTest?._id === t._id && styles.testTabActive]}
              onPress={() => selectTest(t)}>
              <Text style={[styles.testTabText, selectedTest?._id === t._id && styles.testTabTextActive]} numberOfLines={1}>
                {t.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {selectedTest ? (
          <View style={styles.scannerInterface}>
            {/* Action Buttons */}
            <View style={styles.actionCard}>
              <Text style={styles.actionTitle}>OMR Scanner</Text>
              <Text style={styles.actionSubtitle}>
                Capture or upload a printed OMR sheet. Ensure all 4 corner markers are visible.
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.scanBtn} onPress={captureImageFromCamera} disabled={scanning}>
                  <Text style={styles.scanBtnText}>📸 Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.scanBtn, styles.galleryBtn]} onPress={pickImageFromGallery} disabled={scanning}>
                  <Text style={[styles.scanBtnText, styles.galleryBtnText]}>🖼️ Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Processing Status */}
            {scanning && (
              <View style={styles.processingCard}>
                {scanImageUri && (
                  <Image source={{ uri: scanImageUri }} style={styles.previewImage} resizeMode="contain" />
                )}
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#38bdf8" />
                  <Text style={styles.processingText}>{statusText}</Text>
                </View>
              </View>
            )}

            {/* Verification & Grading */}
            {showVerification && gradedResult && (
              <View style={styles.verificationCard}>
                <Text style={styles.verifHeading}>Scan Verification & Grading</Text>

                {scanImageUri && (
                  <Image source={{ uri: scanImageUri }} style={styles.resultPreview} resizeMode="contain" />
                )}

                <Text style={styles.label}>Student Roll Number</Text>
                <TextInput style={styles.rollInput} value={rollNumber} onChangeText={setRollNumber}
                  keyboardType="number-pad" maxLength={8} placeholder="8-digit Roll Number" placeholderTextColor="#64748b" />
                <Text style={styles.infoText}>
                  Review and edit Roll Number if OMR bubble was shaded weakly.
                </Text>

                {/* Score Dashboard */}
                <View style={styles.statsDashboard}>
                  <View style={styles.statsBox}>
                    <Text style={styles.statsVal}>{gradedResult.totalScore} / {gradedResult.maxScore}</Text>
                    <Text style={styles.statsLbl}>Total Score</Text>
                  </View>
                  <View style={styles.statsBox}>
                    <Text style={[styles.statsVal, { color: '#10b981' }]}>{gradedResult.correctCount}</Text>
                    <Text style={styles.statsLbl}>Correct</Text>
                  </View>
                  <View style={styles.statsBox}>
                    <Text style={[styles.statsVal, { color: '#ef4444' }]}>{gradedResult.incorrectCount}</Text>
                    <Text style={styles.statsLbl}>Wrong</Text>
                  </View>
                  <View style={styles.statsBox}>
                    <Text style={[styles.statsVal, { color: '#6366f1' }]}>{gradedResult.accuracy}%</Text>
                    <Text style={styles.statsLbl}>Accuracy</Text>
                  </View>
                </View>

                {/* Answer Grid */}
                <Text style={styles.label}>Answer Key Verification</Text>
                <ScrollView style={styles.gradedAnswersGrid} nestedScrollEnabled>
                  {gradedResult.answers.map((ans) => (
                    <View key={ans.qNo} style={styles.gradedAnsRow}>
                      <Text style={styles.qLabel}>Q{String(ans.qNo).padStart(2, '0')}</Text>
                      <View style={styles.optionsCompare}>
                        <Text style={styles.compareText}>
                          Marked: <Text style={styles.optionVal}>{ans.selectedOption || '-'}</Text>
                        </Text>
                        <Text style={styles.compareText}>
                          Correct: <Text style={[styles.optionVal, { color: '#10b981' }]}>{ans.correctOption}</Text>
                        </Text>
                      </View>
                      <View style={[styles.badgeStatus,
                        ans.isCorrect ? styles.badgeCorrect : (ans.selectedOption ? styles.badgeIncorrect : styles.badgeUnatt)]}>
                        <Text style={[styles.badgeStatusText,
                          ans.isCorrect ? styles.badgeCorrectText : (ans.selectedOption ? styles.badgeIncorrectText : styles.badgeUnattText)]}>
                          {ans.isCorrect ? `+${ans.marksObtained}` : (ans.selectedOption ? `${ans.marksObtained}` : '0')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity style={styles.saveBtn} onPress={saveAttemptToQueue}>
                  <Text style={styles.saveBtnText}>Save & Record Results</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={resetScanState}>
                  <Text style={styles.cancelBtnText}>Discard Scan</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Download offline test papers first in the Sync tab.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f19' },
  selectorHeader: {
    paddingTop: 60, paddingBottom: 16, paddingHorizontal: 24,
    backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  selectorLabel: { fontSize: 11, fontWeight: '800', color: '#38bdf8', letterSpacing: 1, marginBottom: 10 },
  testSlider: { flexDirection: 'row' },
  noTestsText: { color: '#64748b', fontSize: 13, paddingVertical: 4 },
  testTab: {
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 12, marginRight: 10, maxWidth: 200,
  },
  testTabActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  testTabText: { fontSize: 13, color: '#94a3b8', fontWeight: '700' },
  testTabTextActive: { color: '#0f172a' },
  content: { padding: 24 },
  scannerInterface: { gap: 20 },
  actionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderRadius: 24, padding: 20,
  },
  actionTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 6 },
  actionSubtitle: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 12 },
  scanBtn: { flex: 1, backgroundColor: '#4f46e5', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  scanBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  galleryBtn: { backgroundColor: 'transparent', borderColor: '#38bdf8', borderWidth: 1.2 },
  galleryBtnText: { color: '#38bdf8' },
  processingCard: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20,
    borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1, overflow: 'hidden',
  },
  previewImage: { width: '100%', height: 300, opacity: 0.3 },
  processingOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(11,15,25,0.75)', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24,
  },
  processingText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  resultPreview: {
    width: '100%', height: 200, borderRadius: 14, marginBottom: 16,
    backgroundColor: '#1e293b',
  },
  verificationCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderRadius: 24, padding: 20, marginBottom: 30,
  },
  verifHeading: {
    fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingBottom: 12,
  },
  label: { fontSize: 12, fontWeight: '700', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  rollInput: {
    backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderRadius: 12,
    color: '#fff', paddingHorizontal: 16, paddingVertical: 10, fontSize: 18, fontWeight: 'bold',
    letterSpacing: 4, textAlign: 'center', marginBottom: 8,
  },
  infoText: { fontSize: 11, color: '#64748b', lineHeight: 15, marginBottom: 20 },
  statsDashboard: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statsBox: {
    flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center',
  },
  statsVal: { fontSize: 16, fontWeight: '850', color: '#fff' },
  statsLbl: { fontSize: 10, color: '#94a3b8', fontWeight: '600', marginTop: 4 },
  gradedAnswersGrid: {
    backgroundColor: '#0f172a', borderRadius: 14, padding: 8, maxHeight: 200,
    marginBottom: 24, borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1,
  },
  gradedAnsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  qLabel: { fontSize: 13, color: '#fff', fontWeight: '700' },
  optionsCompare: { flexDirection: 'row', gap: 12 },
  compareText: { fontSize: 11, color: '#94a3b8' },
  optionVal: { fontWeight: 'bold', color: '#fff' },
  badgeStatus: { width: 36, paddingVertical: 2, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  badgeCorrect: { backgroundColor: 'rgba(16,185,129,0.15)' },
  badgeIncorrect: { backgroundColor: 'rgba(239,68,68,0.15)' },
  badgeUnatt: { backgroundColor: 'rgba(148,163,184,0.15)' },
  badgeStatusText: { fontSize: 10, fontWeight: 'bold' },
  badgeCorrectText: { color: '#10b981' },
  badgeIncorrectText: { color: '#ef4444' },
  badgeUnattText: { color: '#94a3b8' },
  saveBtn: {
    backgroundColor: '#10b981', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cancelBtn: {
    marginTop: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyText: { textAlign: 'center', color: '#64748b', fontSize: 14 },
});
