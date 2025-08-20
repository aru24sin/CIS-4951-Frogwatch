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
const MAX_MS = MAX_RECORD_SECONDS * 1000;

export default function RecordScreen() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [timer, setTimer] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Refs to avoid stale state in callbacks
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

      // Reset UI
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

      // Keep latest recording in a ref (not state) so callbacks always see it
      recRef.current = recording;

      // Drive timer & progress from recorder’s duration
      recording.setOnRecordingStatusUpdate((st: any) => {
        const dur = Math.max(0, st?.durationMillis ?? 0);
        setTimer(Math.min(MAX_RECORD_SECONDS, Math.floor(dur / 1000)));
        progressAnim.setValue(Math.min(1, dur / MAX_MS));
      });
      // @ts-ignore present at runtime
      recording.setProgressUpdateInterval(150);

      setIsRecording(true);

      // Hard auto-stop at 10s
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

      // Freeze progress where it is
      progressAnim.stopAnimation((v) => progressAnim.setValue(v));

      await rec.stopAndUnloadAsync();
      const tmpUri = rec.getURI();
      recRef.current = null; // release

      if (!tmpUri) {
        Alert.alert('Recording error', 'No audio URI returned.');
        return;
      }

      // Persist into app documents dir (fallback to tmp if copy fails)
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
        Alert.alert('Audio missing', 'The recorded file is no longer available. Please re-record.');
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
    const currentUri = audioUri; // cache before clearing
    // navigate first
    router.push({
      pathname: './predictionScreen',
      params: {
        audioUri: currentUri,
        lat: String(location.latitude),
        lon: String(location.longitude),
      },
    });
    // then reset local UI so coming back is clean
    setAudioUri(null);
    setIsRecording(false);
    setTimer(0);
    progressAnim.setValue(0);
    if (sound) { sound.unloadAsync().catch(() => {}); setSound(null); }
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('./homeScreen')}>
          <Ionicons name="arrow-back" size={32} color="#222" style={styles.icon} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => Alert.alert('Menu pressed')}>
          <Ionicons name="menu" size={32} color="#222" style={styles.icon} />
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Ready to record...</Text>

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

      {/* Record Button (toggles start/stop) */}
      {!audioUri && (
        <TouchableOpacity style={styles.recordButton} onPress={toggleRecord}>
          <View style={[styles.innerCircle, isRecording && { backgroundColor: '#c62828' }]} />
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
  title: { fontSize: 24, color: 'white', marginBottom: 20, alignSelf: 'flex-start', marginLeft: 20 },
  mapContainer: { width: 320, height: 250, borderRadius: 20, overflow: 'hidden' },
  map: { flex: 1 },
  progressBarContainer: {
    width: '80%',
    height: 14,
    backgroundColor: '#2D3E32',
    borderRadius: 7,
    marginTop: 40,
  },
  progressBar: { height: 14, backgroundColor: '#ef6d17ff', borderRadius: 7 },
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
  innerCircle: { width: 70, height: 70, borderRadius: 40, backgroundColor: 'red' },
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
