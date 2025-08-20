// app/(tabs)/predictionScreen.tsx
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// Firebase
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import app, { auth, db } from '../firebaseConfig';

type TopItem = { species: string; confidence: number };

// dev credentials
const EMAIL = 'vnitu393@gmail.com';            
const PASSWORD = 'hello123';    

const speciesImageMap: Record<string, any> = {
  'Bullfrog': require('../../assets/frogs/bullfrog.png'),
  'Green Frog': require('../../assets/frogs/treefrog.png'),
  'Northern Spring Peeper': require('../../assets/frogs/spring_peeper.png'),
  'Northern Leopard Frog': require('../../assets/frogs/northern_leopard.png'),
  'Eastern Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
  'Wood Frog': require('../../assets/frogs/wood_frog.png'),
  'American Toad': require('../../assets/frogs/american_toad.png'),
  'Midland Chorus Frog': require('../../assets/frogs/midland_chorus.png')
};
const placeholderImage = require('../../assets/frogs/placeholder.png');

//dynamic API base for dev 
const DEV_HOST_OVERRIDE = ''; 

function pickDevHost() {
  if (DEV_HOST_OVERRIDE) return DEV_HOST_OVERRIDE;

  const hostUri =
    (Constants as any)?.expoGoConfig?.hostUri ??
    (Constants as any)?.expoGoConfig?.debuggerHost ??
    (Constants as any)?.expoConfig?.hostUri ??
    '';

  if (hostUri) {
    const h = String(hostUri).split(':')[0];
    if (h) return h;
  }

  const scriptURL: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const m = scriptURL?.match(/\/\/([^/:]+):\d+/);
  return m?.[1] ?? 'localhost';
}

export const API_BASE = __DEV__
  ? `http://${pickDevHost()}:8000`
  : 'https://your-production-domain';

console.log('[api] scriptURL =', (NativeModules as any)?.SourceCode?.scriptURL);
console.log('[api] hostUri   =', (Constants as any)?.expoGoConfig?.hostUri || (Constants as any)?.expoConfig?.hostUri);
console.log('[api] API_BASE  =', API_BASE);


//helpers 
function guessMime(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/m4a';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}
function toPercent(confMaybe01: number) {
  return confMaybe01 <= 1 ? confMaybe01 * 100 : confMaybe01;
}
function makeUniqueFileName(ext: string) {
  return `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`;
}

export default function PredictionScreen() {
  const params = useLocalSearchParams<{ audioUri?: string; lat?: string; lon?: string }>();
  const audioUri = params.audioUri ?? '';
  const lat = Number(params.lat ?? NaN);
  const lon = Number(params.lon ?? NaN);

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [predictedSpecies, setPredictedSpecies] = useState('Bullfrog');
  const [confidenceInput, setConfidenceInput] = useState('');
  const [top3, setTop3] = useState<TopItem[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, [sound]);

  useEffect(() => {
    (async () => {
      if (!audioUri) return;

      const info = await FileSystem.getInfoAsync(audioUri);
      if (!info.exists) {
        setApiError('Recorded file is missing. Please re-record.');
        return;
      }

      setLoading(true);
      setApiError(null);
      try {
        const res = await callPredict(audioUri, isFinite(lat) ? lat : undefined, isFinite(lon) ? lon : undefined);
        const pct = toPercent(res.confidence);
        if (!mountedRef.current) return;
        setPredictedSpecies(res.species || 'Bullfrog');
        setConfidenceInput(String(Math.round(pct)));
        setTop3((res.top3 ?? []).map((t: any) => ({
          species: t.species ?? t[0],
          confidence: toPercent(t.confidence ?? t[1]),
        })));
      } catch (e: any) {
        if (!mountedRef.current) return;
        setApiError(e?.message || 'Prediction failed');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUri]);

  const speciesImage = useMemo(
    () => speciesImageMap[predictedSpecies] || placeholderImage,
    [predictedSpecies]
  );

  const handlePlay = async () => {
    if (!audioUri) return;
    try {
      const info = await FileSystem.getInfoAsync(audioUri);
      if (!info.exists) {
        Alert.alert('Audio missing', 'The recorded file is no longer available. Please re-record.');
        return;
      }
      if (sound) {
        await sound.replayAsync();
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });
        setSound(newSound);
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  //SUBMIT: sign in-->upload via REST-->write Firestore
  const handleSubmit = async () => {
    const score = parseInt(confidenceInput, 10);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      Alert.alert('Invalid Confidence', 'Please enter an integer between 0 and 100.');
      return;
    }
    if (!audioUri) {
      Alert.alert('No recording', 'Please record audio first.');
      return;
    }

    try {
      setLoading(true);

      if (!auth.currentUser) {
        await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
      }
      const user = auth.currentUser!;
      const idToken = await user.getIdToken();

      const info = await FileSystem.getInfoAsync(audioUri);
      if (!info.exists) {
        Alert.alert('Audio missing', 'The recorded file is no longer available. Please re-record.');
        return;
      }

      const contentType = guessMime(audioUri); 
      const ext =
        contentType === 'audio/wav' ? '.wav' :
        contentType === 'audio/m4a' ? '.m4a' :
        '.mp3';

      const fileName = makeUniqueFileName(ext);
      const filePath = `uploaded_audios/${fileName}`;

      //Upload to Firebase Storage via REST (
      const bucket = (app.options as any).storageBucket as string; // e.g. 'frogwatch-backend.appspot.com'
      const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(filePath)}`;

      const result = await FileSystem.uploadAsync(uploadUrl, audioUri, {
        httpMethod: 'POST',
        headers: {
          'Content-Type': contentType,
          'Authorization': `Bearer ${idToken}`,
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });

      if (result.status < 200 || result.status >= 300) {
        console.log('Storage upload failed:', result.status, result.body?.slice?.(0, 400));
        throw new Error(`Storage upload failed (${result.status})`);
      }
      console.log('Storage REST upload ok:', result.status);

      const recordingId = `rec_${fileName.slice(0, 8)}`;
      const nowIso = new Date().toISOString();
      const audioURL = `/get-audio/${fileName}`; 

      await setDoc(doc(db, 'recordings', recordingId), {
        recordingId,
        createdBy: user.uid,          
        userId: user.uid,             
        predictedSpecies: predictedSpecies || '',
        species: '',
        confidenceScore: score / 100, 
        top3,
        fileName,
        filePath,
        contentType,
        audioURL,
        location: {
          lat: Number.isFinite(lat) ? lat : 0,
          lng: Number.isFinite(lon) ? lon : 0,
        },
        status: 'pending_analysis',
        history: [{ action: 'submitted', actorId: user.uid, timestamp: nowIso }],
        timestamp: serverTimestamp(),
        timestamp_iso: nowIso,
      });

      Alert.alert('Submitted', 'Your recording was saved to Firebase.');
    } catch (err: any) {
      console.log('Submit failed details:', { name: err?.name, code: err?.code, message: err?.message });
      Alert.alert('Submit failed', err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={speciesImage} style={styles.image} resizeMode="contain" />
      <Text style={styles.speciesName}>{predictedSpecies}</Text>

      {isFinite(lat) && isFinite(lon) && (
        <Text style={{ marginBottom: 8, opacity: 0.7 }}>
          Location used: {lat.toFixed(4)}, {lon.toFixed(4)}
        </Text>
      )}

      {loading && <Text style={{ marginBottom: 8 }}>Running model…</Text>}
      {apiError && <Text style={{ color: '#d32f2f', marginBottom: 8 }}>{apiError}</Text>}

      {top3.length > 0 && (
        <View style={styles.topBox}>
          <Text style={styles.topHeader}>Model suggestions</Text>
          {top3.map((t, i) => (
            <View key={`${t.species}-${i}`} style={styles.topRow}>
              <Text style={styles.topRowSpecies}>{i + 1}. {t.species}</Text>
              <Text style={styles.topRowConf}>{Math.round(t.confidence)}%</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.actionButton} onPress={handlePlay}>
        <Text style={styles.actionButtonText}>Play Recording</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, { marginTop: 10 }]}
        onPress={async () => {
          if (!audioUri) return;
          setLoading(true);
          setApiError(null);
          try {
            const res = await callPredict(audioUri, isFinite(lat) ? lat : undefined, isFinite(lon) ? lon : undefined);
            const pct = toPercent(res.confidence);
            setPredictedSpecies(res.species || 'Bullfrog');
            setConfidenceInput(String(Math.round(pct)));
            setTop3((res.top3 ?? []).map((t: any) => ({
              species: t.species ?? t[0],
              confidence: toPercent(t.confidence ?? t[1]),
            })));
          } catch (e: any) {
            setApiError(e?.message || 'Prediction failed');
          } finally {
            setLoading(false);
          }
        }}
      >
        <Text style={styles.actionButtonText}>Re-run Model</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Confirm Species:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={predictedSpecies}
          onValueChange={(itemValue) => setPredictedSpecies(itemValue)}
          style={styles.picker}
        >
          {Object.keys(speciesImageMap).map((species) => (
            <Picker.Item key={species} label={species} value={species} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Confidence (0–100):</Text>
      <TextInput
        style={styles.input}
        value={confidenceInput}
        onChangeText={setConfidenceInput}
        placeholder="e.g. 85"
        keyboardType="number-pad"
      />

      <TouchableOpacity style={styles.actionButton} onPress={handleSubmit}>
        <Text style={styles.actionButtonText}>Submit</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

//API helpers

async function callPredict(uri: string, lat?: number, lon?: number) {
  const mime = guessMime(uri);
  const form = new FormData();
  form.append('file', { uri, name: uri.split('/').pop() || 'clip', type: mime } as any);
  if (typeof lat === 'number') form.append('lat', String(lat));
  if (typeof lon === 'number') form.append('lon', String(lon));

  const endpoints = [`${API_BASE}/predict`, `${API_BASE}/ml/predict`];
  let lastErr: any = null;

  for (const url of endpoints) {
    try {
      console.log('[predict] POST', url, { mime, uri });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000); // 90s

      const resp = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
      clearTimeout(timer);

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status} ${text.slice(0, 200)}`);
      }
      const data = await resp.json();
      return {
        species: data.species ?? data.name,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
        top3: Array.isArray(data.top3) ? data.top3 : [],
      };
    } catch (e) {
      console.warn('[predict] failed on', url, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error('No endpoint responded');
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#e6f9e1', alignItems: 'center', padding: 40, flexGrow: 1 },
  image: { width: 300, height: 200, borderRadius: 16, marginBottom: 10, borderWidth: 2, borderColor: '#66bb6a' },
  speciesName: { fontSize: 30, fontWeight: '600', marginBottom: 8 },
  topBox: { width: '100%', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#c8e6c9', padding: 12, marginBottom: 10 },
  topHeader: { fontWeight: '700', color: '#2e7d32', marginBottom: 6 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  topRowSpecies: { fontWeight: '500' },
  topRowConf: { opacity: 0.7 },
  label: { marginTop: 20, fontWeight: 'bold', alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginVertical: 10, width: '100%' },
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginVertical: 10, width: '100%', overflow: 'hidden' },
  picker: { width: '100%', height: 60 },
  actionButton: { backgroundColor: '#66bb6a', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 8, marginTop: 15, width: '100%', alignItems: 'center' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
