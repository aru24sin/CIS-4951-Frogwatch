// RegisterScreen.tsx
import { Picker } from '@react-native-picker/picker';
import { Link, router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [securityQ1, setSecurityQ1] = useState('');
  const [securityQ2, setSecurityQ2] = useState('');
  const [securityQ3, setSecurityQ3] = useState('');
  const [role, setRole] = useState<'Volunteer' | 'Expert'>('Volunteer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError('');

    // Basic validation
    if (!email || !password || !firstName || !lastName || !securityQ1 || !securityQ2 || !securityQ3) {
      return setError('Please fill out all fields.');
    }
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return setError('Please enter a valid email.');

    setLoading(true);
    try {
      // 1) Create user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

      // 2) Update display name
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      await updateProfile(cred.user, { displayName });

      // 3) Save profile document
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName,
        role,
        security: {
          q1: securityQ1.trim(),
          q2: securityQ2.trim(),
          q3: securityQ3.trim(),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      Alert.alert('Success', 'Account created!');
      // Use an absolute route; change to your actual tab route if different
      router.replace('././recordScreen'); // or '/recordScreen' if that's your path
    } catch (e: any) {
      console.log('Registration error:', e);
      let msg = 'Could not create account.';
      if (e?.code === 'auth/email-already-in-use') msg = 'Email is already in use.';
      if (e?.code === 'auth/invalid-email') msg = 'Email address is invalid.';
      if (e?.code === 'auth/weak-password') msg = 'Password is too weak.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Register Account</Text>

      <Text style={styles.label}>Enter first name:</Text>
      <TextInput
        placeholder="First Name"
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Enter last name:</Text>
      <TextInput
        placeholder="Last Name"
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Email: (This will be your username)</Text>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Password: (minimum 6 characters long)</Text>
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
        placeholderTextColor="#666"
      />

      {/* Security Question 1 */}
      <Text style={styles.label}>What city were you born in?</Text>
      <TextInput
        placeholder="Enter your answer"
        value={securityQ1}
        onChangeText={setSecurityQ1}
        style={styles.input}
        placeholderTextColor="#666"
      />

      {/* Security Question 2 */}
      <Text style={styles.label}>What is your favorite food?</Text>
      <TextInput
        placeholder="Enter your answer"
        value={securityQ2}
        onChangeText={setSecurityQ2}
        style={styles.input}
        placeholderTextColor="#666"
      />

      {/* Security Question 3 */}
      <Text style={styles.label}>What is your mother's maiden name?</Text>
      <TextInput
        placeholder="Enter your answer"
        value={securityQ3}
        onChangeText={setSecurityQ3}
        style={styles.input}
        placeholderTextColor="#666"
      />

      {/* Role Picker */}
      <Text style={styles.label}>Select Role</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={role} onValueChange={(v) => setRole(v)} style={styles.picker}>
          <Picker.Item label="Volunteer" value="Volunteer" />
          <Picker.Item label="Expert" value="Expert" />
        </Picker>
      </View>

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity onPress={handleRegister} style={[styles.button, loading && { opacity: 0.7 }]} disabled={loading}>
        {loading ? <ActivityIndicator /> : <Text style={styles.buttonText}>Create Account</Text>}
      </TouchableOpacity>

      <Link href="../login" asChild>
        <TouchableOpacity accessibilityRole="link">
          <Text style={styles.link}>Already have an account? Login</Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 44,
    backgroundColor: '#eafbe4',
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 16,
    color: '#000',
  },
  label: {
    fontSize: 16,
    color: '#2e7d32',
    marginBottom: 4,
    marginTop: 8,
  },
  example: {
    fontSize: 12,
    color: '#777',
    marginBottom: 6,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    marginBottom: 20,
  },
  picker: {
    height: 50,
    color: '#000',
    paddingHorizontal: 12,
  },
  button: {
    backgroundColor: '#66bb6a',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  link: {
    color: '#2e7d32',
    textAlign: 'center',
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  error: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 10,
  },
});
