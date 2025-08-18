// login.tsx
import { Link } from 'expo-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, functions } from '../firebaseConfig';

export default function LoginScreen() {
  // login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // forgot-password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fpEmail, setFpEmail] = useState('');
  const [ans1, setAns1] = useState('');
  const [ans2, setAns2] = useState('');
  const [ans3, setAns3] = useState('');
  const [fpBusy, setFpBusy] = useState(false);

  const handleLogin = async () => {
    setError('');
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      console.log('Logged in as:', cred.user.email);
      // TODO: navigate wherever you want after login
      // router.replace('/(tabs)/recordScreen');
    } catch (e: any) {
      setError(e?.message ?? 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
    // Call your callable verifyAnswers; if allowed, send the reset email from the client
    setFpBusy(true);
    try {
      const verify = httpsCallable(functions, 'verifyAnswers');
      const res: any = await verify({
        email: fpEmail.trim().toLowerCase(),
        answers: [ans1.trim(), ans2.trim(), ans3.trim()],
      });

      if (res?.data?.allow) {
        try {
          await sendPasswordResetEmail(auth, fpEmail.trim().toLowerCase());
        } catch {
          // swallow to avoid account enumeration; we still show the generic message below
        }
      }

      Alert.alert(
        'Check your email',
        "If an account exists for that address, you'll receive a password reset email."
      );
      setForgotOpen(false);
      setFpEmail(''); setAns1(''); setAns2(''); setAns3('');
    } catch (err) {
      console.log('Forgot flow error:', err);
      Alert.alert(
        'Check your email',
        "If an account exists for that address, you'll receive a password reset email."
      );
      setForgotOpen(false);
    } finally {
      setFpBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={{ alignItems: 'center', marginTop: 40 }}>
        <Image source={require('../../assets/images/frog_logo.png')} style={{ width: 100, height: 100 }} />
      </View>

      <Text style={styles.title}>Frogwatch+</Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity onPress={handleLogin} style={[styles.button, busy && { opacity: 0.7 }]} disabled={busy}>
        {busy ? <ActivityIndicator /> : <Text style={styles.buttonText}>Login</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setForgotOpen(true)}>
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>

      {/* Use Link if you’re on expo-router */}
      <Link href="./register" style={styles.link}>
        New user? Register here
      </Link>

      {/* Forgot password modal */}
      <Modal visible={forgotOpen} animationType="slide" transparent onRequestClose={() => setForgotOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset password</Text>
            <TextInput
              placeholder="Email"
              placeholderTextColor="#666"
              value={fpEmail}
              onChangeText={setFpEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              placeholder="What city were you born in?"
              placeholderTextColor="#666"
              value={ans1}
              onChangeText={setAns1}
              style={styles.input}
            />
            <TextInput
              placeholder="What is your favorite food?"
              placeholderTextColor="#666"
              value={ans2}
              onChangeText={setAns2}
              style={styles.input}
            />
            <TextInput
              placeholder="What is your mother's maiden name?"
              placeholderTextColor="#666"
              value={ans3}
              onChangeText={setAns3}
              style={styles.input}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleForgot} disabled={fpBusy}>
                {fpBusy ? <ActivityIndicator /> : <Text style={styles.buttonText}>Send reset email</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: '#aaa' }]} onPress={() => setForgotOpen(false)} disabled={fpBusy}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e6f9e1', justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 32, fontWeight: '600', color: '#2e7d32', textAlign: 'center', marginBottom: 40 },
  input: {
    backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 18,
    borderWidth: 1, borderColor: '#c8e6c9', fontSize: 16, color: '#000',
  },
  button: {
    backgroundColor: '#66bb6a', padding: 14, borderRadius: 12, alignItems: 'center',
    marginTop: 10, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 2,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: '#2e7d32', textAlign: 'center', marginTop: 8, textDecorationLine: 'underline' },
  error: { color: '#d32f2f', textAlign: 'center', marginBottom: 10 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: '#eafbe4', borderRadius: 16, padding: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#2e7d32', marginBottom: 12 },
});
