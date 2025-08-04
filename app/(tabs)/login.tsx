import { signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Logged in as:', user.email);
      // Navigate to Home here if using navigation
    } catch (error: any) {
      setError(error.message);
    }
  };

  return (
    
    <View style={styles.container}>
    <View style={{ alignItems: 'center', marginTop: 40 }}>
    <Image  source={require('../../assets/images/frog_logo.png')} style={{ width: 100, height: 100 }} />
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

      <TouchableOpacity onPress={handleLogin} style={styles.button}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>

      <TouchableOpacity>
        <Text style={styles.link}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity>
        <Text style={styles.link}>New user? Register here</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6f9e1', 
    justifyContent: 'center',
    paddingHorizontal: 24,

  },
   logo: {
   width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 20,
    backgroundColor: '#e6f9e1',
    borderRadius: 10, 
    padding: 10,

  },

  title: {
    fontSize: 32,
    fontWeight: 'thin',
    color: '#2e7d32', 
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    fontSize: 16,
    color: '#000',
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
