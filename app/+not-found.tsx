import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Oops, this screen doesn’t exist.</Text>
      <Link href="/(tabs)/landingScreen">Go home</Link>
    </View>
  );
}
