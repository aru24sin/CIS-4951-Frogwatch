import { Picker } from '@react-native-picker/picker';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebaseConfig';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [securityQ1, setSecurityQ1] = useState('');
  const [securityQ2, setSecurityQ2] = useState('');
  const [securityQ3, setSecurityQ3] = useState('');
  const [role, setRole] = useState('Volunteer');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!email || !password || !firstName || !lastName || !securityQ1 || !securityQ2 || !securityQ3) {
      setError('Please fill out all fields.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('User registered:', user.email);
      Alert.alert('Success', 'Account created successfully!');
      // Navigate to login or home
    } catch (error: any) {
      setError(error.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Register Account</Text>

      <TextInput
        placeholder="First Name"
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        placeholderTextColor="#666"
      />
      <TextInput
        placeholder="Last Name"
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        placeholderTextColor="#666"
      />
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor="#666"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
        placeholderTextColor="#666"
      />

      <TextInput
        placeholder="Security Question 1"
        value={securityQ1}
        onChangeText={setSecurityQ1}
        style={styles.input}
        placeholderTextColor="#666"
      />
      <TextInput
        placeholder="Security Question 2"
        value={securityQ2}
        onChangeText={setSecurityQ2}
        style={styles.input}
        placeholderTextColor="#666"
      />
      <TextInput
        placeholder="Security Question 3"
        value={securityQ3}
        onChangeText={setSecurityQ3}
        style={styles.input}
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Select Role</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={role}
          onValueChange={(itemValue) => setRole(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Volunteer" value="Volunteer" />
          <Picker.Item label="Expert" value="Expert" />
        </Picker>
      </View>

      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity onPress={handleRegister} style={styles.button}>
        <Text style={styles.buttonText}>Create Account</Text>
      </TouchableOpacity>

      <TouchableOpacity>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
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
    marginBottom: 8,
    marginTop: 8,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    marginBottom: 20,
  },
  picker: {
    height: 48,
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
