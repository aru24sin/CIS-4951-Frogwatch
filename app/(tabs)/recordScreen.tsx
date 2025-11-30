import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const MAX_RECORD_SECONDS = 10;
const MAX_MS = MAX_RECORD_SECONDS * 1000;

export default function RecordScreen() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [timer, setTimer] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const recRef = useRef<Audio.Recording | null>(null);
  const stoppingRef = useRef(false);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;
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
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (sound) sound.unloadAsync().catch(() => {});
      if (recRef.current) recRef.current.stopAndUnloadAsync().catch(() => {});
    };
  }, [sound]);

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

      setAudioUri(null);
      setTimer(0);
      progressAnim.setValue(0);
      stoppingRef.current = false;
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (sound) {
        await sound.unloadAsync().catch(() => {});
        setSound(null);
      }

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recRef.current = recording;

      recording.setOnRecordingStatusUpdate((st: any) => {
        const dur = Math.max(0, st?.durationMillis ?? 0);
        setTimer(Math.min(MAX_RECORD_SECONDS, Math.floor(dur / 1000)));
        progressAnim.setValue(Math.min(1, dur / MAX_MS));
      });
      // @ts-ignore runtime prop
      recording.setProgressUpdateInterval(150);

      setIsRecording(true);

      autoStopRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_MS);
    } catch (err) {
      console.error('Error starting recording', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
    const rec = recRef.current;
    if (!rec || stoppingRef.current) return;
    try {
      stoppingRef.current = true;
      if (autoStopRef.current) {
        clearTimeout(autoStopRef.current);
        autoStopRef.current = null;
      }
      setIsRecording(false);
      progressAnim.stopAnimation((v) => progressAnim.setValue(v));

      await rec.stopAndUnloadAsync();
      const tmpUri = rec.getURI();
      recRef.current = null;

      if (!tmpUri) {
        Alert.alert('Recording error', 'No audio URI returned.');
        return;
      }

      try {
        const dir = FileSystem.documentDirectory + 'recordings/';
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const extMatch = tmpUri.match(/\.[a-z0-9]+$/i);
        const ext = extMatch ? extMatch[0] : '.m4a';
        const finalUri = `${dir}rec-${Date.now()}${ext}`;
        await FileSystem.copyAsync({ from: tmpUri, to: finalUri });
        setAudioUri(finalUri);
      } catch {
        setAudioUri(tmpUri);
      }
    } catch (err) {
      console.error('Error stopping recording', err);
      Alert.alert('Error', 'Could not stop recording.');
    } finally {
      stoppingRef.current = false;
    }
  };

  const toggleRecord = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const playAudio = async () => {
    if (!audioUri) return;
    try {
      const info = await FileSystem.getInfoAsync(audioUri);
      if (!info.exists) {
        Alert.alert('Audio missing', 'The recording is no longer available. Please re-record.');
        return;
      }

      if (sound) {
        const status: any = await sound.getStatusAsync();
        if (status?.isLoaded) {
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
      const currentUri = audioUri;
      router.push({
        pathname: './predictionScreen',
        params: {
          audioUri: currentUri,
          lat: String(location.latitude),
          lon: String(location.longitude),
        },
      });
      setAudioUri(null);
      setIsRecording(false);
      setTimer(0);
      progressAnim.setValue(0);
      if (sound) { sound.unloadAsync().catch(() => {}); setSound(null); }
    }
  };

  if (isLoading || !location) {
    return (
      <View style={styles.background}>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 50 }} />
      </View>
    );
  }

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.background}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => Alert.alert('Menu pressed')} style={styles.iconButton}>
              <Ionicons name="menu" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isRecording ? 'Listening...' : audioUri ? 'Recording Complete' : 'Listening...'}
          </Text>

          {/* Map Container */}
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
              <Marker coordinate={location}>
                <View style={styles.markerCircle} />
              </Marker>
            </MapView>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <Animated.View style={[styles.progressBar, { width: progressBarWidth }]} />
          </View>

          {/* Timer */}
          <Text style={styles.timerText}>{timer}s</Text>

          {/* Record Button */}
          {!audioUri && (
            <TouchableOpacity 
              style={styles.recordButton} 
              onPress={toggleRecord}
              activeOpacity={0.8}
            >
              <View style={styles.recordButtonOuter}>
                <View style={[styles.recordButtonInner, isRecording && styles.recordingActive]} />
              </View>
            </TouchableOpacity>
          )}

          {/* Actions after recording */}
          {audioUri && !isRecording && (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={playAudio}>
                <Text style={styles.actionText}>Play/Replay Recording</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={reRecord}>
                <Text style={styles.actionText}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={upload}>
                <Text style={styles.actionText}>Analyze Recording</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#3F5A47',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  container: {
    alignItems: 'center',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '400',
    color: '#ccff00',
    marginBottom: 30,
    letterSpacing: 0.5,
  },
  mapContainer: {
    width: '85%',
    height: 350,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  map: {
    flex: 1,
  },
  markerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4a90e2',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  progressBarContainer: {
    width: '85%',
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 4,
    marginTop: 30,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4a7c59',
    borderRadius: 4,
  },
  timerText: {
    fontSize: 28,
    fontWeight: '400',
    color: '#fff',
    marginTop: 15,
    letterSpacing: 1,
  },
  recordButton: {
    marginTop: 30,
    marginBottom: 20,
  },
  recordButtonOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2d3e34',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#c93939',
  },
  recordingActive: {
    backgroundColor: '#d32f2f',
  },
  actions: {
    marginTop: 20,
    marginBottom: 40,
    width: '85%',
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  analyzeButton: {
    backgroundColor: '#4a7c59',
    borderColor: '#4a7c59',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});