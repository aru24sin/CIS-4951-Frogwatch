import React from 'react';
import { Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function LandingScreen({ navigation }: any) {
  return (
    <ImageBackground
      source={require('../../assets/images/gradient-background.png')}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Frog graphic */}
      <View style={styles.topContent}>
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
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Register')}>
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
    marginTop: 80,
  },
  logo: {
    width: 1500,
    height: 150,
    resizeMode: 'contain',
  },
  middleContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 70,
    fontWeight: '400',
    color: '#000',
    textAlign: 'left',
  },
  frogWord: {
    color: '#50BD46',
    fontWeight: '500',
  },
  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 80,
    paddingHorizontal: 10,
  },
  button: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 18,
    borderRadius: 20,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '300',
  },
});
