import React, { useState } from 'react';
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
  ScrollView,
  SafeAreaView,
  Image
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ApiService from '../services/ApiService';
import StorageService from '../services/StorageService';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await ApiService.login(email.trim(), password);
      const loggedUser = res.user;

      if (loggedUser.role !== 'admin' && loggedUser.role !== 'coordinator') {
        // Clear immediately to prevent unauthorized access
        await StorageService.clearSession();
        Alert.alert('Access Denied', 'Only authenticated Admin or Coordinator accounts are authorized to use this application.');
        return;
      }

      Alert.alert('Access Granted', `Welcome back, ${loggedUser.name}!`);
      onLoginSuccess(loggedUser);
    } catch (err) {
      console.error('[LOGIN ERROR]:', err);
      Alert.alert('Authentication Failed', err.message || 'Please check your credentials and network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logoImage}
              />
            </View>
            <Text style={styles.title}>GARUD OMR</Text>
            <Text style={styles.subtitle}>Secure Grading Engine</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>Admin & Coordinator Sign In</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter authorized email"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#64748b"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : (
                <Text style={styles.loginBtnText}>Secure Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
          
          <Text style={styles.footerText}>Authorized Access Only</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  logoImage: {
    width: 95,
    height: 95,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#38bdf8',
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  },
  loginBtn: {
    backgroundColor: '#38bdf8',
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerText: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 32,
  },
});
