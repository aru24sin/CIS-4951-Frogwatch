import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const MAX_RECORD_SECONDS = 10;

export default function RecordScreen() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [timer, setTimer] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission denied');
        setIsLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setIsLoading(false);
    })();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (sound) sound.unloadAsync().catch(() => {});
      if (recording) recording.stopAndUnloadAsync().catch(() => {});
    };
  }, [sound, recording]);

  const startRecording = async () => {
    if (isRecording) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setAudioUri(null);
      if (sound) {
        sound.unloadAsync().catch(() => {});
        setSound(null);
      }
      setIsRecording(true);
      setTimer(0);
      progressAnim.setValue(0);

      intervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev >= MAX_RECORD_SECONDS - 1) {
            stopRecording();
            return MAX_RECORD_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MAX_RECORD_SECONDS * 1000,
        useNativeDriver: false,
      }).start();
    } catch (err) {
      console.error('Error starting recording', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsRecording(false);

      await recording.stopAndUnloadAsync();
      const tmpUri = recording.getURI();
      setRecording(null);

      if (!tmpUri) {
        Alert.alert('Recording error', 'No audio URI returned.');
        return;
      }

      // Persist to a stable location so it won't disappear
      const dir = FileSystem.documentDirectory + 'recordings/';
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

      const ext = tmpUri.includes('.') ? tmpUri.substring(tmpUri.lastIndexOf('.')) : '.m4a';
      const finalUri = dir + `rec-${Date.now()}${ext}`;
      await FileSystem.copyAsync({ from: tmpUri, to: finalUri });

      setAudioUri(finalUri);
    } catch (err) {
      console.error('Error stopping recording', err);
      Alert.alert('Error', 'Could not stop recording.');
    }
  };

  const playAudio = async () => {
    if (!audioUri) return;
    try {
      const info = await FileSystem.getInfoAsync(audioUri);
      if (!info.exists) {
        Alert.alert('Audio missing', 'The recorded file is no longer available. Please re-record.');
        return;
      }

      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.replayAsync();
          return;
        } else {
          await sound.unloadAsync().catch(() => {});
          setSound(null);
        }
      }

      const { sound: newSound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
      setSound(newSound);
    } catch (err) {
      console.error('Error playing sound', err);
    }
  };

  const reRecord = () => {
    Alert.alert(
      'Start New Recording?',
      'This will delete the current recording. Do you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: () => {
            setAudioUri(null);
            if (sound) {
              sound.unloadAsync().catch(() => {});
              setSound(null);
            }
            setTimer(0);
            progressAnim.setValue(0);
          },
        },
      ]
    );
  };

  const upload = () => {
    if (audioUri && location) {
      router.push({
        pathname: './predictionScreen',                 // correct route name
        params: {
          audioUri,
          lat: String(location.latitude),
          lon: String(location.longitude),
        },
      });
    }
  };

  if (isLoading || !location) {
    return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;
  }

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Top Half - Map */}
      <View style={{ flex: 1 }}>
        <MapView
          style={{ flex: 1 }}
          region={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker coordinate={location} />
        </MapView>
      </View>

      {/* Bottom Half - Controls */}
      <View style={styles.controlContainer}>
        {!audioUri && (
          <>
            {!isRecording ? (
              <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
                <Text style={styles.buttonText}>Start Recording</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.progressBarContainer}>
                  <Animated.View style={[styles.progressBar, { width: progressBarWidth }]} />
                </View>
                <Text style={styles.timerText}>{timer}s</Text>
                <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
                  <Text style={styles.buttonText}>Stop Recording</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {audioUri && !isRecording && (
          <>
            <TouchableOpacity style={styles.actionButton} onPress={playAudio}>
              <Text style={styles.buttonText}>Play Recording</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={reRecord}>
              <Text style={styles.buttonText}>Re-record</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={upload}>
              <Text style={styles.buttonText}>Analyze (send to model)</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controlContainer: {
    flex: 1,
    backgroundColor: '#e6f9e1',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  recordButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 30,
    width: '80%',
    alignItems: 'center',
    marginTop: 10,
  },
  stopButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 14,
    borderRadius: 30,
    width: '80%',
    alignItems: 'center',
    marginTop: 10,
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 30,
    width: '80%',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressBarContainer: {
    width: '80%',
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    marginTop: 20,
  },
  progressBar: {
    height: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 5,
  },
  timerText: {
    fontSize: 16,
    marginTop: 10,
  },
});
