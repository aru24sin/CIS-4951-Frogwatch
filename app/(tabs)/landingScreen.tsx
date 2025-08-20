import { useRouter } from 'expo-router';
import React from 'react';
import { Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <ImageBackground
      source={require('../../assets/images/gradient-background.png')}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Brand + Frog graphic */}
      <View style={styles.topContent}>
        <Text style={styles.brand}>Frogwatch+</Text>
        <Image
          source={require('../../assets/images/frog-umbrella-clipart-xl.png')}
          style={styles.logo}
        />
      </View>

      {/* Title text */}
      <View style={styles.middleContent}>
        <Text style={styles.title}>
          All your <Text style={styles.frogWord}>frogs</Text> in one app!
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity style={styles.button} onPress={() => router.push('./login')}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => router.push('./register')}>
          <Text style={styles.buttonText}>Register</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topContent: {
    alignItems: 'center',
    marginTop: 100,
  },
  brand: {
    fontSize: 50,
    fontWeight: '400',
    color: '#2D3E32',
    letterSpacing: 5,
    textAlign: 'center',
    marginBottom: 11,
  },
  logo: {
    width: 250,
    height: 250,
    resizeMode: 'contain',
    marginTop: 18,
    marginRight: 0,
  },
  middleContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 30,
    marginBottom: 2,
  },
  title: {
    fontSize: 30,
    fontWeight: '400',
    color: '#000',
    textAlign: 'center',
    lineHeight: 50,
  },
  frogWord: {
    color: '#50BD46',
    fontWeight: '500',
  },
  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 70,
    paddingHorizontal: 5,
    paddingVertical: 20,
  },
  button: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 10,
    borderRadius: 50,
    marginHorizontal: 3,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '300',
    textAlign: 'center',
    paddingTop: 12,
    paddingLeft: 5,
    paddingRight: 5,
    paddingBottom: 15,
  },
});
