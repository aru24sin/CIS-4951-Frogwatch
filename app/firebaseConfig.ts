// firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyABWfk9NTHL8sCRHMgEzmVD8in6QP4LHeQ',
  authDomain: 'frogwatch-beta.firebaseapp.com',
  projectId: 'frogwatch-beta',
  storageBucket: 'frogwatch-beta.firebasestorage.app',
  messagingSenderId: '298888687683',
  appId: '1:298888687683:web:4918de1d3e77fcd31be4f6',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);