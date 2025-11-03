import { Stack } from 'expo-router';

export default function ExpertStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Expert home dashboard */}
      <Stack.Screen name="index" />

      {/* Shows pending/approved/rejected submissions */}
      <Stack.Screen name="review-queue" />

      {/* Individual submission review screen */}
      <Stack.Screen name="submission/[id]" />
    </Stack>
  );
}
