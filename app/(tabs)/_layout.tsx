// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Keep your existing UI bits
import { HapticTab } from '../../components/HapticTab';
import TabBarBackground from '../../components/ui/TabBarBackground';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

// NOTE: adjust this import if your firebaseConfig path differs
import { auth, db } from '../../src/firebaseConfig'; // if this errors, try: "../../firebaseConfig"

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [role, setRole] = useState<'volunteer' | 'expert' | 'admin' | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const sub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          setRole(null);
        } else {
          const snap = await getDoc(doc(db, 'users', user.uid));
          setRole((snap.data()?.role ?? 'volunteer') as any);
        }
      } finally {
        setAuthReady(true);
      }
    });
    return () => sub();
  }, []);

  // While we don't know the role yet, still render tabs to prevent layout flicker
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: { position: 'absolute' },
          default: {},
        }),
      }}
    >
      {/* Your existing volunteer tab(s) */}
      <Tabs.Screen
        name="landingScreen"
        options={{ title: '' }}
      />

      {/* Add any other volunteer tabs you already use, e.g.: */}
      {/* <Tabs.Screen name="recordScreen" options={{ title: 'Record' }} /> */}
      {/* <Tabs.Screen name="predictionScreen" options={{ title: 'Predict' }} /> */}

      {/* Expert tab appears only for expert/admin (once authReady) */}
      {authReady && (role === 'expert' || role === 'admin') && (
        <Tabs.Screen
          name="expert/index"
          options={{ title: 'Expert' }}
        />
      )}
    </Tabs>
  );
}
