import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import StorageService from '../services/StorageService';

export default function CreateOmrScreen({ navigation }) {
  const [title, setTitle] = useState('Garud Monthly Test');
  const [questionCount, setQuestionCount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [downloadedTests, setDownloadedTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState('');

  useEffect(() => {
    loadOfflineTests();
  }, []);

  const loadOfflineTests = async () => {
    try {
      const list = await StorageService.getDownloadedTests();
      setDownloadedTests(list || []);
    } catch (err) {
      console.warn('Failed to load offline tests for selection:', err);
    }
  };

  const handleSelectTest = (testId) => {
    setSelectedTestId(testId);
    if (testId === 'custom' || !testId) {
      setTitle('Garud Monthly Test');
      setQuestionCount('100');
      return;
    }

    const test = downloadedTests.find(t => t._id === testId);
    if (test) {
      setTitle(test.name);
      
      // Calculate total questions across all sections recursively
      let totalQ = 0;
      if (Array.isArray(test.sections)) {
        test.sections.forEach(s => {
          if (Array.isArray(s.questions)) {
            totalQ += s.questions.length;
          }
        });
      }
      
      // Safe fallback options
      if (totalQ === 0 && test.totalQuestions) {
        totalQ = test.totalQuestions;
      }
      if (totalQ === 0) totalQ = 100;
      
      setQuestionCount(String(totalQ));
    }
  };

  const generateOmrPdf = async () => {
    const qCount = parseInt(questionCount, 10);
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a test title');
      return;
    }
    if (isNaN(qCount) || qCount < 5 || qCount > 200) {
      Alert.alert('Error', 'Questions count must be between 5 and 200');
      return;
    }

    setLoading(true);
    try {
      // Always print exactly 5 columns to keep bubble coordinates 100% static in physical space
      const colCapacity = 40;
      const activeCols = 5;

      // Generate HTML for OMR sheet matching coordinates
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: 'Helvetica', 'Arial', sans-serif;
            color: #000;
            background-color: #fff;
            width: 210mm;
            height: 297mm;
            position: relative;
            box-sizing: border-box;
          }
          
          /* Corner Anchors - Exact coordinate mapping targets */
          .anchor {
            position: absolute;
            width: 7mm;
            height: 7mm;
            background-color: #000;
          }
          .anchor-tl { top: 6mm; left: 6mm; }
          .anchor-tr { top: 6mm; right: 6mm; }
          .anchor-bl { bottom: 6mm; left: 6mm; }
          .anchor-br { bottom: 6mm; right: 6mm; }
          
          /* Header Info */
          .header {
            padding-top: 15mm;
            padding-left: 20mm;
            padding-right: 20mm;
            text-align: center;
          }
          .logo {
            font-size: 28px;
            font-weight: 900;
            letter-spacing: 2px;
            margin-bottom: 2mm;
          }
          .logo span {
            border: 2px solid #000;
            padding: 2px 8px;
            background-color: #000;
            color: #fff;
          }
          .title {
            font-size: 18px;
            font-weight: 700;
            margin: 1mm 0;
            text-transform: uppercase;
          }
          
          /* Main Meta Grid */
          .meta-section {
            margin: 4mm 20mm;
            display: flex;
            justify-content: space-between;
            gap: 10mm;
          }
          .meta-box {
            border: 1.5px solid #000;
            height: 12mm;
            display: flex;
            align-items: center;
            padding-left: 4mm;
            font-size: 12px;
            font-weight: 700;
            flex-grow: 1;
            text-transform: uppercase;
          }
          
          /* OMR Container Area */
          .omr-body {
            position: absolute;
            top: 48mm;
            left: 0;
            width: 210mm;
            bottom: 12mm;
          }
          
          /* Roll Number Block */
          /* Matches storage coordinates: X 15% (150px) to 48% (480px), Y 17% (240px) to 34.5% (488px) */
          /* In A4: 15% of 210mm = 31.5mm, 48% = 100.8mm */
          /* 17% of 297mm = 50.5mm, 34.5% = 102.5mm */
          .roll-number-container {
            position: absolute;
            left: 31.5mm;
            top: 4.5mm;
            width: 69.3mm; /* (100.8 - 31.5) = 69.3 */
            height: 52mm;  /* (102.5 - 50.5) = 52 */
            border: 1.5px solid #000;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
          }
          .roll-title {
            background-color: #000;
            color: #fff;
            text-align: center;
            font-size: 10px;
            font-weight: bold;
            padding: 1mm 0;
            letter-spacing: 0.5px;
          }
          .roll-columns {
            display: flex;
            flex-direction: row;
            height: 100%;
          }
          .roll-col {
            flex: 1;
            border-right: 1px solid #ccc;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-around;
            padding: 0.5mm 0;
          }
          .roll-col:last-child {
            border-right: none;
          }
          .roll-digit-header {
            font-size: 9px;
            font-weight: bold;
            border-bottom: 1px solid #000;
            width: 100%;
            text-align: center;
            padding-bottom: 0.5mm;
          }
          
          /* Instructions box next to roll number */
          .instructions-box {
            position: absolute;
            left: 107mm;
            top: 4.5mm;
            width: 71.5mm;
            height: 52mm;
            border: 1.5px solid #000;
            box-sizing: border-box;
            padding: 3mm;
            font-size: 9px;
            line-height: 1.4;
          }
          .instructions-box h4 {
            margin: 0 0 1mm 0;
            font-weight: bold;
            font-size: 10px;
            text-transform: uppercase;
          }
          
          /* Questions Container Area */
          /* Y: start 560px (39.6% of 1414 => 117.6mm) */
          .questions-container {
            position: absolute;
            top: 64mm; /* Y alignment matches scanning start */
            left: 0;
            width: 210mm;
            bottom: 0;
            display: flex;
            flex-direction: row;
            padding: 0 8mm;
            box-sizing: border-box;
          }
          
          .question-column {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 0 2mm;
            box-sizing: border-box;
          }
          
          .question-row {
            height: 4.1mm; /* matches row step exactly in print */
            display: flex;
            flex-direction: row;
            align-items: center;
            font-size: 9px;
            font-weight: bold;
            border-bottom: 0.5px dashed #eee;
          }
          
          .q-no {
            width: 8mm;
            text-align: right;
            padding-right: 2.5mm;
          }
          
          .bubble-options {
            display: flex;
            flex-direction: row;
            gap: 1.35mm; /* matches option spacing step */
          }
          
          /* OMR Bubble style */
          .bubble {
            width: 3.4mm;
            height: 3.4mm;
            border: 1.2px solid #000;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 7px;
            font-weight: bold;
            box-sizing: border-box;
          }
          
          .footer-note {
            position: absolute;
            bottom: 12mm;
            left: 20mm;
            right: 20mm;
            text-align: center;
            font-size: 8px;
            color: #777;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
      
        <!-- Calibration Anchors -->
        <div class="anchor anchor-tl"></div>
        <div class="anchor anchor-tr"></div>
        <div class="anchor anchor-bl"></div>
        <div class="anchor anchor-br"></div>
        
        <!-- Header -->
        <div class="header">
          <div class="logo"><span>GARUD CLASSES</span></div>
          <div class="title">${title}</div>
        </div>
        
        <!-- Student Metadata -->
        <div class="meta-section">
          <div class="meta-box" style="flex-grow: 2;">STUDENT NAME:</div>
          <div class="meta-box">BATCH:</div>
          <div class="meta-box">DATE:</div>
        </div>
        
        <div class="omr-body">
        
          <!-- Roll Number Box -->
          <div class="roll-number-container">
            <div class="roll-title">ROLL NUMBER</div>
            <div class="roll-columns">
              ${Array.from({ length: 8 }).map((_, cIdx) => `
                <div class="roll-col">
                  <div class="roll-digit-header">&nbsp;</div>
                  ${Array.from({ length: 10 }).map((_, rIdx) => `
                    <div class="bubble">${rIdx}</div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Instructions -->
          <div class="instructions-box">
            <h4>Instructions</h4>
            <ul style="margin: 0; padding-left: 4mm;">
              <li>Use blue/black ballpoint pen only.</li>
              <li>Darken the bubble completely. Do not tick or cross.</li>
              <li>Ensure the four black corner markers are completely visible in photo scan.</li>
              <li>Keep the paper flat and avoid shadows while clicking picture.</li>
            </ul>
          </div>
          
          <!-- Questions Grid -->
          <div class="questions-container">
            ${Array.from({ length: activeCols }).map((_, colIdx) => `
              <div class="question-column">
                ${Array.from({ length: colCapacity }).map((_, rIdx) => {
                  const qNo = colIdx * colCapacity + rIdx + 1;
                  const isActive = qNo <= qCount;
                  return `
                    <div class="question-row" style="${isActive ? '' : 'opacity: 0.12; pointer-events: none;'}">
                      <div class="q-no">${String(qNo).padStart(3, '0')}</div>
                      <div class="bubble-options">
                        <div class="bubble">A</div>
                        <div class="bubble">B</div>
                        <div class="bubble">C</div>
                        <div class="bubble">D</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `).join('')}
          </div>
          
        </div>
        
        <div class="footer-note">
          DO NOT WRITE OUTSIDE SCANNABLE REGION. SCAN AND VERIFY USING THE GARUD SCANNER MOBILE APP.
        </div>
      
      </body>
      </html>
      `;

      // Generate the PDF file
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      setLoading(false);

      // Open native file sharing
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share OMR - ${title}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Generated', `OMR PDF is generated at: ${uri}`);
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Error generating OMR', err.message || 'Something went wrong');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.titleText}>OMR Sheet Creator</Text>
        <Text style={styles.subtitleText}>
          Generate a high-contrast printable OMR sheet matching our calibration grid system.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Select Downloaded Test Paper</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.pickerScroll}
            contentContainerStyle={styles.pickerScrollContent}
          >
            <TouchableOpacity
              style={[styles.pickerItem, selectedTestId === 'custom' || selectedTestId === '' ? styles.pickerItemActive : null]}
              onPress={() => handleSelectTest('custom')}
            >
              <Text style={styles.pickerItemIcon}>⚙️</Text>
              <Text style={styles.pickerItemText}>Custom Sheet</Text>
            </TouchableOpacity>
            
            {downloadedTests.map((test) => (
              <TouchableOpacity
                key={test._id}
                style={[styles.pickerItem, selectedTestId === test._id ? styles.pickerItemActive : null]}
                onPress={() => handleSelectTest(test._id)}
              >
                <Text style={styles.pickerItemIcon}>📝</Text>
                <Text style={styles.pickerItemText} numberOfLines={1}>{test.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Test Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Physics Weekly Quiz"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Total Questions</Text>
          <TextInput
            style={styles.input}
            value={questionCount}
            onChangeText={setQuestionCount}
            keyboardType="number-pad"
            placeholder="e.g. 100 (Max 200)"
            placeholderTextColor="#64748b"
            maxLength={3}
          />
          <Text style={styles.infoText}>
            Up to 200 questions are supported. The scannable area features a locked 200-question coordinate layout grid, highlighting active ones and leaving extra slots inactive.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={generateOmrPdf}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Generate Printable PDF</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Visual Mock Preview of Sheet Layout */}
        <View style={styles.previewContainer}>
          <Text style={styles.previewHeading}>Calibration Layout Preview</Text>
          <View style={styles.mockSheet}>
            {/* 4 Corner Anchors represented */}
            <View style={[styles.mockAnchor, { top: 6, left: 6 }]} />
            <View style={[styles.mockAnchor, { top: 6, right: 6 }]} />
            <View style={[styles.mockAnchor, { bottom: 6, left: 6 }]} />
            <View style={[styles.mockAnchor, { bottom: 6, right: 6 }]} />

            <Text style={styles.mockHeader}>GARUD OMR TEMPLATE</Text>
            <View style={styles.mockMetaRow}>
              <View style={styles.mockMetaLine} />
              <View style={[styles.mockMetaLine, { width: '30%' }]} />
            </View>

            <View style={styles.mockLowerArea}>
              {/* Roll Number Box Mock */}
              <View style={styles.mockRollBox}>
                <Text style={styles.mockRollTitle}>ROLL NO</Text>
                <View style={styles.mockRollBubbles}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <View key={i} style={styles.mockRollCol}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <View key={j} style={styles.mockMiniBubble} />
                      ))}
                    </View>
                  ))}
                </View>
              </View>

              {/* Instructions Mock */}
              <View style={styles.mockInstructBox}>
                <View style={styles.mockInstructLine} />
                <View style={[styles.mockInstructLine, { width: '80%' }]} />
                <View style={[styles.mockInstructLine, { width: '90%' }]} />
              </View>
            </View>

            {/* Questions Grid mock */}
            <View style={styles.mockGrid}>
              <View style={styles.mockGridCol}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={styles.mockGridRow}>
                    <View style={styles.mockMiniLabel} />
                    <View style={styles.mockMiniBubble} />
                    <View style={styles.mockMiniBubble} />
                    <View style={styles.mockMiniBubble} />
                  </View>
                ))}
              </View>
              <View style={styles.mockGridCol}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={styles.mockGridRow}>
                    <View style={styles.mockMiniLabel} />
                    <View style={styles.mockMiniBubble} />
                    <View style={styles.mockMiniBubble} />
                    <View style={styles.mockMiniBubble} />
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  titleText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    marginBottom: 28,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f172a',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 14,
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  previewHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#818cf8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  mockSheet: {
    width: 200,
    height: 282,
    backgroundColor: '#fff',
    borderRadius: 8,
    position: 'relative',
    padding: 10,
    boxSizing: 'border-box',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  mockAnchor: {
    position: 'absolute',
    width: 8,
    height: 8,
    backgroundColor: '#000',
  },
  mockHeader: {
    fontSize: 8,
    fontWeight: '900',
    color: '#000',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  mockMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 8,
  },
  mockMetaLine: {
    height: 3,
    backgroundColor: '#ddd',
    width: '50%',
    borderRadius: 1,
  },
  mockLowerArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  mockRollBox: {
    width: 32,
    height: 34,
    borderWidth: 0.8,
    borderColor: '#000',
    padding: 1,
  },
  mockRollTitle: {
    fontSize: 4,
    fontWeight: 'bold',
    backgroundColor: '#000',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 5,
  },
  mockRollBubbles: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 1,
  },
  mockRollCol: {
    alignItems: 'center',
  },
  mockMiniBubble: {
    width: 2,
    height: 2,
    borderRadius: 1,
    borderWidth: 0.4,
    borderColor: '#000',
    marginVertical: 0.3,
  },
  mockInstructBox: {
    width: 46,
    height: 34,
    borderWidth: 0.8,
    borderColor: '#000',
    padding: 3,
    justifyContent: 'center',
  },
  mockInstructLine: {
    height: 1.5,
    backgroundColor: '#ccc',
    width: '100%',
    marginVertical: 1,
  },
  mockGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 12,
  },
  mockGridCol: {
    width: '46%',
  },
  mockGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
    borderBottomWidth: 0.2,
    borderBottomColor: '#eee',
    paddingBottom: 1,
  },
  mockMiniLabel: {
    width: 5,
    height: 2,
    backgroundColor: '#aaa',
    marginRight: 3,
  },
  pickerScroll: {
    marginVertical: 12,
    paddingBottom: 6,
  },
  pickerScrollContent: {
    gap: 10,
    paddingRight: 20,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 130,
    maxWidth: 220,
  },
  pickerItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  pickerItemIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  pickerItemText: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
  },
});
