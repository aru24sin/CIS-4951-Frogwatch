import { Stack } from 'expo-router';

export default function ExpertStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Expert Dashboard' }} />
      <Stack.Screen name="review-queue" options={{ title: 'Review Queue' }} />
      <Stack.Screen name="submission/[id]" options={{ title: 'Review Submission' }} />
    </Stack>
  );
}
