// app/(tabs)/_layout.tsx
import { Stack } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="landingScreen" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="volunteerHomeScreen" />
      <Stack.Screen name="expertHomeScreen" />
      <Stack.Screen name="adminHomeScreen" />
      <Stack.Screen name="recordScreen" />
      <Stack.Screen name="predictionScreen" />
      <Stack.Screen name="historyScreen" />
      <Stack.Screen name="mapHistoryScreen" />
      <Stack.Screen name="profileScreen" />
      <Stack.Screen name="settingsScreen" />
      <Stack.Screen name="usersScreen" />
      <Stack.Screen name="feedbackScreen" />
      <Stack.Screen name="expert" />
    </Stack>
  );
}
