// firebaseConfig.ts 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';


const firebaseConfig = {
  apiKey: 'AIzaSyBAC0q10qWH-_v1j9KOpnCqTQnXP7EZBwM',
  authDomain: 'frogwatch-backend.firebaseapp.com',
  projectId: 'frogwatch-backend',
  storageBucket: 'frogwatch-backend.firebasestorage.app',
  messagingSenderId: '1066546787031',
  appId: '1:1066546787031:web:026e93e5c6050910a9b692',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance;

if (Platform.OS === 'web') {

// Web build
  authInstance = getAuth(app);
}else {
  const { getReactNativePersistence } = require('firebase/auth/react-native');
  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    authInstance = getAuth(app);
  }
}

export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

export default app;
