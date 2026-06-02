import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import StorageService from '../services/StorageService';

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const [stats, setStats] = useState({
    testsCount: 0,
    queueCount: 0,
    syncCompleted: 0
  });

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    const localTests = await StorageService.getDownloadedTests();
    const localQueue = await StorageService.getOfflineQueue();
    
    setStats({
      testsCount: localTests.length,
      queueCount: localQueue.length,
      syncCompleted: 0 // Local analytics tracking
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Glow Header Portal Banner */}
        <View style={styles.portalHeader}>
          <Text style={styles.brandingSpan}>GARUD PORTAL</Text>
          <Text style={styles.portalTitle}>OMR Suite Console</Text>
          <Text style={styles.portalSub}>
            Offline-first industrial bubble sheet creation and computer vision grading engine.
          </Text>
        </View>

        {/* Dynamic Analytics Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{stats.queueCount}</Text>
            <Text style={styles.statLabel}>Pending Syncs</Text>
          </View>
          
          <View style={[styles.statCard, styles.violetCard]}>
            <Text style={[styles.statVal, { color: '#818cf8' }]}>{stats.testsCount}</Text>
            <Text style={styles.statLabel}>Offline Tests</Text>
          </View>
        </View>

        {/* Actions Navigation Hub Grid */}
        <Text style={styles.sectionHeading}>Console Hub Actions</Text>
        
        <View style={styles.hubGrid}>
          {/* Action 1: Create OMR Sheet */}
          <TouchableOpacity
            style={styles.hubItem}
            onPress={() => navigation.navigate('CreateOmr')}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(56, 189, 248, 0.1)' }]}>
              <Text style={[styles.iconText, { color: '#38bdf8' }]}>📄</Text>
            </View>
            <Text style={styles.hubItemTitle}>Create OMR Sheet</Text>
            <Text style={styles.hubItemDesc}>Generate printable PDF OMR grids up to 200 Qs.</Text>
          </TouchableOpacity>

          {/* Action 2: Scan OMR Sheet */}
          <TouchableOpacity
            style={styles.hubItem}
            onPress={() => navigation.navigate('ScanSheet')}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Text style={[styles.iconText, { color: '#10b981' }]}>📸</Text>
            </View>
            <Text style={styles.hubItemTitle}>Scan OMR Sheet</Text>
            <Text style={styles.hubItemDesc}>Grading with high-precision corner CV warping.</Text>
          </TouchableOpacity>

          {/* Action 3: Download Tests */}
          <TouchableOpacity
            style={styles.hubItem}
            onPress={() => navigation.navigate('FetchTest')}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(129, 140, 248, 0.1)' }]}>
              <Text style={[styles.iconText, { color: '#818cf8' }]}>🔄</Text>
            </View>
            <Text style={styles.hubItemTitle}>Sync & Login</Text>
            <Text style={styles.hubItemDesc}>Download papers offline and configure server IP.</Text>
          </TouchableOpacity>

          {/* Action 4: Sync Queue */}
          <TouchableOpacity
            style={styles.hubItem}
            onPress={() => navigation.navigate('Queue')}
          >
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
              <Text style={[styles.iconText, { color: '#6366f1' }]}>📤</Text>
            </View>
            <Text style={styles.hubItemTitle}>Sync Queue</Text>
            <Text style={styles.hubItemDesc}>Bulk upload locally-saved marks to Garud portal.</Text>
          </TouchableOpacity>
        </View>

        {/* Offline Status Panel */}
        <View style={styles.statusFooter}>
          <View style={styles.greenPulse} />
          <Text style={styles.statusText}>Local SQLite-Async database operational</Text>
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
    paddingTop: 65,
    paddingBottom: 40,
  },
  portalHeader: {
    marginBottom: 32,
  },
  brandingSpan: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  portalTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  portalSub: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginTop: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  violetCard: {
    borderColor: 'rgba(129, 140, 248, 0.15)',
  },
  statVal: {
    fontSize: 28,
    fontWeight: '850',
    color: '#38bdf8',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 6,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38bdf8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  hubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 32,
  },
  hubItem: {
    width: (width - 64) / 2, // dynamic grid sizing
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    justifyContent: 'space-between',
    minHeight: 150,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconText: {
    fontSize: 18,
  },
  hubItemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  hubItemDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  statusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    paddingVertical: 10,
  },
  greenPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: 'bold',
  },
});
