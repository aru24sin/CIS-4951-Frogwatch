// login.tsx
import { Link, useRouter } from 'expo-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, functions } from '../firebaseConfig';

export default function LoginScreen() {
  const router = useRouter();

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
      // Go straight to the Home tab
      router.replace('./homeScreen');
    } catch (e: any) {
      setError(e?.message ?? 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async () => {
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
        } catch {}
      }

      Alert.alert(
        'Check your email',
        "If an account exists for that username, you will receive a password reset email."
      );
      setForgotOpen(false);
      setFpEmail(''); setAns1(''); setAns2(''); setAns3('');
    } catch (err) {
      console.log('Forgot flow error:', err);
      Alert.alert(
        'Check your email',
        "If an account exists for that username, you will receive a password reset email."
      );
      setForgotOpen(false);
    } finally {
      setFpBusy(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/images/gradient-background.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <Text style={styles.title}>Login</Text>

      <TextInput
        placeholder="Username"
        placeholderTextColor="#fff"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#fff"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity onPress={handleLogin} style={[styles.button, busy && { opacity: 0.7 }]} disabled={busy}>
        {busy ? <ActivityIndicator /> : <Text style={styles.buttonText}>Enter</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setForgotOpen(true)}>
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>

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
              placeholderTextColor="#f1f1f1ff"
              value={fpEmail}
              onChangeText={setFpEmail}
              style={styles.modalInput}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              placeholder="What city were you born in?"
              placeholderTextColor="#f1f1f1ff"
              value={ans1}
              onChangeText={setAns1}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="What is your favorite food?"
              placeholderTextColor="#f1f1f1ff"
              value={ans2}
              onChangeText={setAns2}
              style={styles.modalInput}
            />
            <TextInput
              placeholder="What is your mother's maiden name?"
              placeholderTextColor="#f1f1f1ff"
              value={ans3}
              onChangeText={setAns3}
              style={styles.modalInput}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#1f2b20' }]}
                onPress={handleForgot}
                disabled={fpBusy}
              >
                {fpBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Send email</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#222d22ff' }]}
                onPress={() => setForgotOpen(false)}
                disabled={fpBusy}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 68, fontWeight: '400', color: '#000', marginBottom: 20, marginLeft: 10 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 18,
    borderRadius: 30,
    paddingTop: 22,
    paddingBottom: 22,
    marginBottom: 10,
    fontSize: 18,
    color: '#fff',
  },
  button: {
    backgroundColor: '#2D3E32',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 50,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    alignSelf: 'center',
    minWidth: 160,
  },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '500' },
  link: { color: '#000', textAlign: 'center', marginTop: 8, textDecorationLine: 'underline' },
  error: { color: '#d32f2f', textAlign: 'center', marginBottom: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#252c25ff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#3ab132ff', marginBottom: 12 },
  modalInput: { backgroundColor: '#151515ff', padding: 16, borderRadius: 25, marginBottom: 16, fontSize: 16, color: '#000' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#3ab132ff',
  },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
