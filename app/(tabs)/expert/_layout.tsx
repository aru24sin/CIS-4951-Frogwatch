// app/(tabs)/expert/_layout.tsx
import { Stack } from 'expo-router';

export default function ExpertStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Expert home dashboard */}
      <Stack.Screen name="index" />

      {/* Lists filtered submissions by status (pending/approved/rejected) */}
      <Stack.Screen name="submissions-list" />

      {/* Shows pending submissions */}
      <Stack.Screen name="review-queue" />

      {/* Individual submission review screen */}
      <Stack.Screen name="submission/[id]" />
    </Stack>
  );
}
