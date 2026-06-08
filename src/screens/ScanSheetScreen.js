import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, ScrollView, Image, Dimensions, PanResponder
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, Camera } from 'expo-camera';
import StorageService from '../services/StorageService';
import { processOmrNative } from '../services/OmrProcessor';
import * as ImageManipulator from 'expo-image-manipulator';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null); // { uri, width, height }
  const cameraRef = useRef(null);

  // Dynamic Cropping States
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const panXRef = useRef(0);
  const panYRef = useRef(0);
  useEffect(() => {
    panXRef.current = panX;
    panYRef.current = panY;
  }, [panX, panY]);

  const zoomRef = useRef(1.0);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const panStart = useRef({ x: 0, y: 0 });
  const pinchStartDist = useRef(0);
  const pinchStartZoom = useRef(1.0);
  const previousTouchesCount = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        previousTouchesCount.current = touches.length;
        if (touches.length === 1) {
          panStart.current = { x: panXRef.current - gestureState.dx, y: panYRef.current - gestureState.dy };
        } else if (touches.length === 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          pinchStartDist.current = Math.sqrt(dx * dx + dy * dy);
          pinchStartZoom.current = zoomRef.current;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        const currentCount = touches.length;

        // Reset positions dynamically when finger count changes during the gesture
        if (currentCount !== previousTouchesCount.current) {
          if (currentCount === 1) {
            panStart.current = { x: panXRef.current - gestureState.dx, y: panYRef.current - gestureState.dy };
            pinchStartDist.current = 0;
          } else if (currentCount === 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            pinchStartDist.current = Math.sqrt(dx * dx + dy * dy);
            pinchStartZoom.current = zoomRef.current;
          }
          previousTouchesCount.current = currentCount;
          return;
        }

        if (currentCount === 1) {
          setPanX(panStart.current.x + gestureState.dx);
          setPanY(panStart.current.y + gestureState.dy);
        } else if (currentCount === 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (pinchStartDist.current > 0) {
            const factor = dist / pinchStartDist.current;
            const newZoom = Math.max(0.5, Math.min(3.0, pinchStartZoom.current * factor));
            setZoom(newZoom);
          }
        }
      },
      onPanResponderRelease: () => {
        pinchStartDist.current = 0;
        previousTouchesCount.current = 0;
      }
    })
  ).current;

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
    setShowCamera(false);
    setCameraReady(false);
    setCapturedPhoto(null);
  };

  // --- Capture / Upload ---
  const pickImageFromGallery = async () => {
    if (!selectedTest) { Alert.alert('Selection Required', 'Please select an offline test first'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        runOmr(result.assets[0].base64, result.assets[0].uri);
      }
    } catch { Alert.alert('Error', 'Failed to load image from gallery'); }
  };

  const captureImageFromCamera = () => {
    if (!selectedTest) { Alert.alert('Selection Required', 'Please select an offline test first'); return; }
    if (!cameraPermission) { Alert.alert('Permission Denied', 'Camera permission required'); return; }
    setShowCamera(true);
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !cameraReady) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo && photo.uri) {
        // Normalize the captured photo coordinates & rotation
        const normalized = await ImageManipulator.manipulateAsync(
          photo.uri,
          [],
          { compress: 1.0 }
        );
        setShowCamera(false);
        setCameraReady(false);
        setZoom(1.0);
        setPanX(0);
        setPanY(0);
        setCapturedPhoto({ uri: normalized.uri, width: normalized.width, height: normalized.height });
      }
    } catch (e) { Alert.alert('Error', 'Failed to capture photo: ' + (e.message || e)); }
  };

  const processCapture = async () => {
    if (!capturedPhoto) return;
    try {
      setStatusText('Cropping OMR sheet...');
      setScanning(true);

      const viewportW = SCREEN_W;
      const viewportH = SCREEN_H - 240;

      const scaleToFit = Math.min(viewportW / capturedPhoto.width, viewportH / capturedPhoto.height);
      const imgDisplayW = capturedPhoto.width * scaleToFit;
      const imgDisplayH = capturedPhoto.height * scaleToFit;

      const frameW = SCREEN_W * 0.85;
      const frameH = frameW * (297 / 210);

      // Scale factor of the displayed image (including user zoom)
      const scaleFactor = scaleToFit * zoom;

      // Distance from top-left of the zoomed image to top-left of the guide frame
      const frameX = (viewportW - frameW) / 2;
      const frameY = (viewportH - frameH) / 2;

      // Zoomed image dimensions
      const zoomedW = imgDisplayW * zoom;
      const zoomedH = imgDisplayH * zoom;

      // Zoomed image top-left
      const imgX = (viewportW - zoomedW) / 2 + panX;
      const imgY = (viewportH - zoomedH) / 2 + panY;

      // Calculate crop coordinates relative to the zoomed image (in screen pixels)
      const screenCropX = frameX - imgX;
      const screenCropY = frameY - imgY;

      // Convert screen pixels to original image pixels
      const originX = Math.max(0, Math.round(screenCropX / scaleFactor));
      const originY = Math.max(0, Math.round(screenCropY / scaleFactor));
      const cropW = Math.min(Math.round(frameW / scaleFactor), capturedPhoto.width - originX);
      const cropH = Math.min(Math.round(frameH / scaleFactor), capturedPhoto.height - originY);

      // Perform crop
      const result = await ImageManipulator.manipulateAsync(
        capturedPhoto.uri,
        [{ crop: { originX, originY, width: cropW, height: cropH } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8, base64: true }
      );

      setCapturedPhoto(null);
      if (result.base64) {
        runOmr(result.base64, result.uri);
      } else {
        Alert.alert('Error', 'Failed to crop image');
        setScanning(false);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to crop: ' + (e.message || e));
      setScanning(false);
    }
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

  const saveAttemptToQueue = async () => {
    if (!selectedTest || !gradedResult) return;
    if (rollNumber.includes('?') || rollNumber.length !== 8) {
      Alert.alert('Invalid Roll Number', 'Please enter a valid 8-digit roll number'); return;
    }
    const record = {
      testId: selectedTest._id,
      testName: selectedTest.name,
      rollNo: rollNumber.trim(),
      answers: gradedResult.answers.map(a => ({
        questionId: a.questionId,
        sectionId: a.sectionId,
        selectedOption: a.selectedOption || '-',
        correctOption: a.correctOption || '-',
        isCorrect: a.isCorrect,
        marksObtained: a.marksObtained
      })),
      totalScore: gradedResult.totalScore,
      maxScore: gradedResult.maxScore,
      correctCount: gradedResult.correctCount,
      incorrectCount: gradedResult.incorrectCount,
      scannedAt: new Date().toISOString(),
    };
    const ok = await StorageService.addToQueue(record);
    if (ok) Alert.alert('Recorded', `Result saved for Roll: ${rollNumber}!`, [{ text: 'OK', onPress: resetScanState }]);
    else Alert.alert('Error', 'Failed to save');
  };

  // --- Captured Photo Preview ---
  if (capturedPhoto) {
    const viewportW = SCREEN_W;
    const viewportH = SCREEN_H - 240;

    const scaleToFit = Math.min(viewportW / capturedPhoto.width, viewportH / capturedPhoto.height);
    const imgDisplayW = capturedPhoto.width * scaleToFit;
    const imgDisplayH = capturedPhoto.height * scaleToFit;

    return (
      <View style={styles.cameraContainer}>
        <StatusBar style="light" />
        
        {/* Viewport holding image and guideFrame */}
        <View 
          style={{ width: viewportW, height: viewportH, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}
          {...panResponder.panHandlers}
        >
          {/* Zoomed/Panned Image */}
          <Image 
            source={{ uri: capturedPhoto.uri }} 
            style={{ 
              width: imgDisplayW, 
              height: imgDisplayH,
              transform: [
                { translateX: panX },
                { translateY: panY },
                { scale: zoom }
              ]
            }} 
            resizeMode="contain" 
          />

          {/* Alignment Guide Frame overlay */}
          <View style={styles.overlayContainer} pointerEvents="none">
            <View style={styles.guideFrame}>
              {/* Corner L-brackets */}
              <View style={[styles.cornerBracket, styles.cornerTL]} />
              <View style={[styles.cornerBracketH, styles.cornerTL_H]} />
              <View style={[styles.cornerBracket, styles.cornerTR]} />
              <View style={[styles.cornerBracketH, styles.cornerTR_H]} />
              <View style={[styles.cornerBracket, styles.cornerBL]} />
              <View style={[styles.cornerBracketH, styles.cornerBL_H]} />
              <View style={[styles.cornerBracket, styles.cornerBR]} />
              <View style={[styles.cornerBracketH, styles.cornerBR_H]} />
              {/* Corner dots */}
              <View style={[styles.cornerDot, { top: -6, left: -6 }]} />
              <View style={[styles.cornerDot, { top: -6, right: -6 }]} />
              <View style={[styles.cornerDot, { bottom: -6, left: -6 }]} />
              <View style={[styles.cornerDot, { bottom: -6, right: -6 }]} />
            </View>
          </View>
        </View>

        {/* Dynamic crop controller pad */}
        <View style={styles.cropController}>
          <View style={styles.cropNavRow}>
            {/* Pan arrows */}
            <TouchableOpacity style={styles.navBtn} onPress={() => setPanY(p => p - 10)}>
              <Text style={styles.navBtnText}>▲</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <TouchableOpacity style={styles.navBtn} onPress={() => setPanX(p => p - 10)}>
                <Text style={styles.navBtnText}>◀</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} onPress={() => { setPanX(0); setPanY(0); setZoom(1.0); }}>
                <Text style={styles.navBtnText}>⟲</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.navBtn} onPress={() => setPanX(p => p + 10)}>
                <Text style={styles.navBtnText}>▶</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.navBtn} onPress={() => setPanY(p => p + 10)}>
              <Text style={styles.navBtnText}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Zoom controls */}
          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom(z => Math.max(0.5, z - 0.05))}>
              <Text style={styles.zoomBtnText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom(z => Math.min(3.0, z + 0.05))}>
              <Text style={styles.zoomBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Primary Action Buttons */}
        <View style={styles.camControls}>
          <TouchableOpacity style={styles.camCancelBtn} onPress={() => { setCapturedPhoto(null); setShowCamera(true); }}>
            <Text style={styles.camCancelText}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.previewScanBtn} onPress={processCapture}>
            <Text style={styles.previewScanText}>✓ Crop & Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.camCancelBtn} onPress={() => setCapturedPhoto(null)}>
            <Text style={styles.camCancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Custom Camera Overlay ---
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <StatusBar style="light" />
        <CameraView
          ref={cameraRef}
          style={styles.cameraPreview}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        />
        {/* Corner alignment guides */}
        <View style={styles.overlayContainer} pointerEvents="box-none">
          {/* Guide frame — A4 aspect ratio (210:297 ≈ 0.707) */}
          <View style={styles.guideFrame} pointerEvents="none">
            {/* Corner L-brackets */}
            <View style={[styles.cornerBracket, styles.cornerTL]} />
            <View style={[styles.cornerBracketH, styles.cornerTL_H]} />
            <View style={[styles.cornerBracket, styles.cornerTR]} />
            <View style={[styles.cornerBracketH, styles.cornerTR_H]} />
            <View style={[styles.cornerBracket, styles.cornerBL]} />
            <View style={[styles.cornerBracketH, styles.cornerBL_H]} />
            <View style={[styles.cornerBracket, styles.cornerBR]} />
            <View style={[styles.cornerBracketH, styles.cornerBR_H]} />
            {/* Corner dots */}
            <View style={[styles.cornerDot, { top: -6, left: -6 }]} />
            <View style={[styles.cornerDot, { top: -6, right: -6 }]} />
            <View style={[styles.cornerDot, { bottom: -6, left: -6 }]} />
            <View style={[styles.cornerDot, { bottom: -6, right: -6 }]} />
          </View>
          {/* Instruction text */}
          <View style={styles.camInstructionBar}>
            <Text style={styles.camInstructionText}>Align the 4 corner squares of the OMR sheet with the dots</Text>
          </View>
        </View>
        {/* Bottom controls */}
        <View style={styles.camControls}>
          <TouchableOpacity style={styles.camCancelBtn} onPress={() => { setShowCamera(false); setCameraReady(false); }}>
            <Text style={styles.camCancelText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.camCaptureBtn, !cameraReady && { opacity: 0.4 }]} onPress={takePhoto} disabled={!cameraReady}>
            <View style={styles.camCaptureInner} />
          </TouchableOpacity>
          <View style={{ width: 50 }} />
        </View>
      </View>
    );
  }

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
  // --- Camera Overlay Styles ---
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraPreview: { flex: 1 },
  overlayContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  guideFrame: {
    width: SCREEN_W * 0.85,
    height: SCREEN_W * 0.85 * (297 / 210),
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)', borderRadius: 4,
  },
  cornerBracket: {
    position: 'absolute', width: 3, height: 30,
    backgroundColor: '#38bdf8',
  },
  cornerBracketH: {
    position: 'absolute', width: 30, height: 3,
    backgroundColor: '#38bdf8',
  },
  cornerTL: { top: 0, left: 0 },
  cornerTL_H: { top: 0, left: 0 },
  cornerTR: { top: 0, right: 0 },
  cornerTR_H: { top: 0, right: 0 },
  cornerBL: { bottom: 0, left: 0 },
  cornerBL_H: { bottom: 0, left: 0 },
  cornerBR: { bottom: 0, right: 0 },
  cornerBR_H: { bottom: 0, right: 0 },
  cornerDot: {
    position: 'absolute', width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#f43f5e', borderWidth: 2, borderColor: '#fff',
  },
  camInstructionBar: {
    position: 'absolute', top: 60, left: 20, right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 12,
  },
  camInstructionText: {
    color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center',
  },
  camControls: {
    position: 'absolute', bottom: 40, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 30,
  },
  camCancelBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  camCancelText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  camCaptureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  camCaptureInner: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#fff',
  },
  previewFull: {
    flex: 1, width: '100%', backgroundColor: '#000',
  },
  previewScanBtn: {
    backgroundColor: '#10b981', borderRadius: 30,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  previewScanText: {
    color: '#fff', fontSize: 16, fontWeight: '800',
  },
  cropController: {
    position: 'absolute', bottom: 120, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.65)', paddingVertical: 10,
  },
  cropNavRow: {
    alignItems: 'center', gap: 4,
  },
  navBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  navBtnText: {
    color: '#fff', fontSize: 16, fontWeight: 'bold',
  },
  zoomControls: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  zoomBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  zoomBtnText: {
    color: '#fff', fontSize: 22, fontWeight: 'bold',
  },
  zoomLabel: {
    color: '#fff', fontSize: 14, fontWeight: 'bold', minWidth: 50, textAlign: 'center',
  },
});
