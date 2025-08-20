import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
          if (prev + 1 > MAX_RECORD_SECONDS) {
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

      // Stop progress animation immediately
      progressAnim.stopAnimation((currentValue) => {
        progressAnim.setValue(currentValue);
      });

      await recording.stopAndUnloadAsync();
      const tmpUri = recording.getURI();
      setRecording(null);

      if (!tmpUri) {
        Alert.alert('Recording error', 'No audio URI returned.');
        return;
      }

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

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );
      setSound(newSound);
    } catch (err) {
      console.error('Error playing sound', err);
    }
  };

  const reRecord = () => {
    Alert.alert('Start New Recording?', 'This will delete the current recording.', [
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
    ]);
  };

  const upload = () => {
    if (audioUri && location) {
      router.push({
        pathname: './predictionScreen',
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
    <View style={styles.container}>
      {/* Header with nav icons */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('./homeScreen')}>
          <Ionicons name="arrow-back" size={32} color="#222" style={styles.icon} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => Alert.alert('Menu pressed')}>
          <Ionicons name="menu" size={32} color="#222" style={styles.icon} />
        </TouchableOpacity>
      </View>

      {/* Listening label */}
      <Text style={styles.title}>Listening...</Text>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
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

      {/* Progress */}
      <View style={styles.progressBarContainer}>
        <Animated.View style={[styles.progressBar, { width: progressBarWidth }]} />
      </View>
      <Text style={styles.timerText}>{timer}s</Text>

      {/* Record Button */}
      {!audioUri && (
        <TouchableOpacity
          style={styles.recordButton}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <View style={styles.innerCircle} />
        </TouchableOpacity>
      )}

      {/* Actions after recording */}
      {audioUri && !isRecording && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={playAudio}>
            <Text style={styles.actionText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={reRecord}>
            <Text style={styles.actionText}>Re-record</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={upload}>
            <Text style={styles.actionText}>Analyze</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3F5A47', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    padding: 20,
    marginTop: 50,
  },
  icon: { backgroundColor: '#00000020', padding: 12, borderRadius: 50 },
  title: { fontSize: 38, color: 'white', marginBottom: 20, alignSelf: 'flex-start', marginLeft: 20 },
  mapContainer: { width: 320, height: 250, borderRadius: 20, overflow: 'hidden' },
  map: { flex: 1 },
  progressBarContainer: {
    width: '80%',
    height: 14,
    backgroundColor: '#2D3E32',
    borderRadius: 7,
    marginTop: 40,
  },
  progressBar: { height: 14, backgroundColor: '#638B6F', borderRadius: 7 },
  timerText: { fontSize: 22, color: 'white', marginTop: 10 },
  recordButton: {
    marginTop: 30,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'red' },
  actions: { marginTop: 20, width: '100%', alignItems: 'center' },
  actionButton: {
    backgroundColor: '#638B6F',
    padding: 12,
    borderRadius: 12,
    width: '60%',
    alignItems: 'center',
    marginVertical: 5,
  },
  actionText: { color: 'white', fontSize: 18, fontWeight: '600' },
});
