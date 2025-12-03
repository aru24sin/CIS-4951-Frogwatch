// app/(tabs)/expert/_layout.tsx
import { Stack } from 'expo-router';
import React from 'react';

export default function ExpertLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="review-queue" />
      <Stack.Screen name="submission/[id]" />
    </Stack>
  );
}
