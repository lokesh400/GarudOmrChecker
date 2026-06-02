import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, Platform, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Import Screens
import HomeScreen from './src/screens/HomeScreen';
import CreateOmrScreen from './src/screens/CreateOmrScreen';
import ScanSheetScreen from './src/screens/ScanSheetScreen';
import FetchTestScreen from './src/screens/FetchTestScreen';
import LoginScreen from './src/screens/LoginScreen';

import StorageService from './src/services/StorageService';

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [currentScreen, setCurrentScreen] = useState('Home');

  useEffect(() => {
    checkUserSession();
  }, []);

  const checkUserSession = async () => {
    try {
      const userInfo = await StorageService.getUserInfo();
      if (userInfo && (userInfo.role === 'admin' || userInfo.role === 'coordinator')) {
        setUser(userInfo);
      } else {
        await StorageService.clearSession();
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    await StorageService.clearSession();
    setUser(null);
    setCurrentScreen('Home');
  };

  // Elegant, reliable navigation emulator
  const navigation = {
    navigate: (screenName) => {
      setCurrentScreen(screenName);
    },
    addListener: () => () => {} // Clean stub to prevent crashes on third-party calls
  };

  const renderActiveScreen = () => {
    switch (currentScreen) {
      case 'Home':
        return <HomeScreen navigation={navigation} user={user} onLogout={handleLogout} />;
      case 'CreateOmr':
        return <CreateOmrScreen navigation={navigation} />;
      case 'ScanSheet':
        return <ScanSheetScreen navigation={navigation} />;
      case 'FetchTest':
        return <FetchTestScreen navigation={navigation} user={user} onLogout={handleLogout} />;
      default:
        return <HomeScreen navigation={navigation} user={user} onLogout={handleLogout} />;
    }
  };

  const navItems = [
    { key: 'Home', label: 'Dashboard', icon: '🏠' },
    { key: 'CreateOmr', label: 'Create', icon: '📄' },
    { key: 'ScanSheet', label: 'Scan', icon: '📸' },
    { key: 'FetchTest', label: 'Sync', icon: '🔄' }
  ];

  if (loadingAuth) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#38bdf8" />
      </SafeAreaView>
    );
  }

  // Gate the entire OMR application behind authentication
  if (!user) {
    return (
      <LoginScreen onLoginSuccess={(loggedUser) => setUser(loggedUser)} />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.screenArea}>
        {renderActiveScreen()}
      </View>
      
      {/* Glowing Bottom Floating Tab Bar */}
      <View style={styles.bottomNav}>
        {navItems.map((item) => {
          const isActive = currentScreen === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.navButton}
              onPress={() => setCurrentScreen(item.key)}
            >
              <Text style={[styles.navIcon, isActive && styles.navIconActive]}>
                {item.icon}
              </Text>
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                {item.label}
              </Text>
              {isActive && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  screenArea: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 76 : 64,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: Platform.OS === 'ios' ? 16 : 0,
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 8,
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    position: 'relative',
  },
  navIcon: {
    fontSize: 18,
    opacity: 0.4,
  },
  navIconActive: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 4,
  },
  navLabelActive: {
    color: '#38bdf8',
  },
  activeDot: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#38bdf8',
  }
});
