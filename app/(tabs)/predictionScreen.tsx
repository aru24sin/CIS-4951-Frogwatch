// app/(tabs)/predictionScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ImageBackground,
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
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import app, { auth, db } from '../firebaseConfig';

type TopItem = { species: string; confidence: number };

/* ---------------- species images ---------------- */
const speciesImageMap: Record<string, any> = {
  Bullfrog: require('../../assets/frogs_background/bullfrog.jpg'),
  'Green Frog': require('../../assets/frogs_background/american_green_treefrog.jpg'),
  'Northern Spring Peeper': require('../../assets/frogs_background/spring_peeper.jpeg'),
  'Northern Leopard Frog': require('../../assets/frogs_background/northern_leopard.jpg'),
  'Eastern Gray Treefrog': require('../../assets/frogs_background/grey_treefrog.jpg'),
  'Wood Frog': require('../../assets/frogs_background/wood_frog.jpg'),
  'American Toad': require('../../assets/frogs_background/american_toad.jpg'),
  'Midland Chorus Frog': require('../../assets/frogs_background/midland_chorus_frog.jpg'),
};
const placeholderImage = require('../../assets/frogs/placeholder.png');

/* ---------------- dynamic API base (dev) ---------------- */
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

export const API_BASE = __DEV__ ? `http://${pickDevHost()}:8000` : 'https://your-production-domain';

/* ---------------- helpers ---------------- */
function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/m4a';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.aac')) return 'audio/aac';
  return 'application/octet-stream';
}
function toPercent(confMaybe01: number) {
  return confMaybe01 <= 1 ? confMaybe01 * 100 : confMaybe01;
}
function makeUniqueFileName(ext: string) {
  return `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`;
}
function isHttpUrl(s?: string) {
  return !!s && /^https?:\/\//i.test(s);
}

async function getUserProfile(uid: string) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) return snap.data() as any;
  } catch {}
  return null;
}

async function ensureSignedIn() {
  if (auth.currentUser) return;
  if (!__DEV__) throw new Error('Not signed in. Please log in.');

  const email = process.env.EXPO_PUBLIC_DEV_EMAIL;
  const password = process.env.EXPO_PUBLIC_DEV_PASSWORD;
  if (!email || !password) {
    throw new Error('No dev credentials. Set EXPO_PUBLIC_DEV_EMAIL / EXPO_PUBLIC_DEV_PASSWORD.');
  }
  await signInWithEmailAndPassword(auth, email, password);
}

// Reverse geocoding helper
async function getCityFromCoords(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );
    const data = await response.json();
    const city = data.address?.city || data.address?.town || data.address?.village || 'Unknown Location';
    const state = data.address?.state || '';
    return state ? `${city}, ${state}` : city;
  } catch (error) {
    console.error('Geocoding error:', error);
    return 'Unknown Location';
  }
}

/* ---------------- component ---------------- */
export default function PredictionScreen() {
  const params = useLocalSearchParams<{ audioUri?: string; lat?: string; lon?: string }>();
  const router = useRouter();
  const audioUri = params.audioUri ?? '';
  const lat = Number(params.lat ?? NaN);
  const lon = Number(params.lon ?? NaN);

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [predictedSpecies, setPredictedSpecies] = useState('Bullfrog');
  const [confidenceInput, setConfidenceInput] = useState('');
  const [notes, setNotes] = useState('');
  const [top3, setTop3] = useState<TopItem[]>([]);
  const [role, setRole] = useState<'volunteer' | 'expert' | 'admin' | null>(null);
  const [submitAsExpert, setSubmitAsExpert] = useState(false);
  const [showEditOptions, setShowEditOptions] = useState(false);
  const [locationCity, setLocationCity] = useState('Loading location...');
  const mountedRef = useRef(true);

  useEffect(() => {
    console.log('[predict] API_BASE =', API_BASE);
    return () => {
      mountedRef.current = false;
      if (sound) sound.unloadAsync().catch(() => {});
    };
  }, [sound]);

  // fetch role if signed in
  useEffect(() => {
    (async () => {
      try {
        if (!auth.currentUser) return;
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        setRole((snap.data()?.role ?? 'volunteer') as any);
      } catch {
        setRole('volunteer' as any);
      }
    })();
  }, []);

  // Get city from coordinates
  useEffect(() => {
    (async () => {
      if (isFinite(lat) && isFinite(lon)) {
        const city = await getCityFromCoords(lat, lon);
        setLocationCity(city);
      } else {
        setLocationCity('Unknown Location');
      }
    })();
  }, [lat, lon]);

  // Run the model once on mount
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
        const res = await callPredict(
          audioUri,
          isFinite(lat) ? lat : undefined,
          isFinite(lon) ? lon : undefined
        );
        const pct = toPercent(res.confidence);
        if (!mountedRef.current) return;
        setPredictedSpecies(res.species || 'Bullfrog');
        setConfidenceInput(String(Math.round(pct)));
        setTop3(
          (res.top3 ?? []).map((t: any) => ({
            species: t.species ?? t[0],
            confidence: toPercent(t.confidence ?? t[1]),
          }))
        );
      } catch (e: any) {
        if (!mountedRef.current) return;
        setApiError(e?.message || 'Prediction failed');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [audioUri]);

  const backgroundSource = useMemo(() => {
    if (predictedSpecies && speciesImageMap[predictedSpecies]) {
      return speciesImageMap[predictedSpecies];
    }
    return null;
  }, [predictedSpecies]);

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

      await ensureSignedIn();
      const user = auth.currentUser!;
      const idToken = await user.getIdToken();

      const profile = await getUserProfile(user.uid);
      const firstName = profile?.firstName ?? '';
      const lastName = profile?.lastName ?? '';
      const displayName =
        profile?.displayName ?? user.displayName ?? `${firstName || ''} ${lastName || ''}`.trim();
      const userEmail = user.email ?? '';

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

      const bucket = (app.options as any).storageBucket as string | undefined;
      if (!bucket) throw new Error('Missing Firebase storage bucket in config.');
      const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(filePath)}`;

      const result = await FileSystem.uploadAsync(uploadUrl, audioUri, {
        httpMethod: 'POST',
        headers: {
          'Content-Type': contentType,
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (result.status < 200 || result.status >= 300) {
        console.log('Storage upload failed:', result.status, result.body?.slice?.(0, 400));
        throw new Error(`Storage upload failed (${result.status})`);
      }

      const recRef = doc(collection(db, 'recordings'));
      const recordingId = recRef.id;

      const nowIso = new Date().toISOString();
      const audioURL = `/get-audio/${fileName}`;

      const aiBlock = {
        species: predictedSpecies || '',
        confidence: score / 100,
        top3: (top3 || []).map((t) => ({
          species: t.species,
          confidence: t.confidence > 1 ? Math.max(0, Math.min(1, t.confidence / 100)) : t.confidence,
        })),
      };

      const baseDoc = {
        recordingId,
        createdBy: user.uid,
        userId: user.uid,
        predictedSpecies: predictedSpecies || '',
        species: '',
        confidenceScore: score / 100,
        top3,
        ai: aiBlock,
        fileName,
        filePath,
        contentType,
        audioURL,
        notes: notes || '',
        location: {
          lat: Number.isFinite(lat) ? lat : 0,
          lng: Number.isFinite(lon) ? lon : 0,
        },
        history: [{ action: 'submitted', actorId: user.uid, timestamp: nowIso }],
        timestamp: serverTimestamp(),
        timestamp_iso: nowIso,
        submitter: {
          uid: user.uid,
          displayName,
          firstName,
          lastName,
          email: userEmail,
        },
      };

      const isExpert = role === 'expert' || role === 'admin';

      if (submitAsExpert && isExpert) {
        await setDoc(recRef, {
          ...baseDoc,
          status: 'approved',
          expertReview: {
            species: predictedSpecies || '',
            confidence: score / 100,
            reviewer: { uid: user.uid, firstName, lastName },
            reviewedAt: serverTimestamp(),
          },
        });
        Alert.alert('Submitted', 'Your recording was saved and approved as an expert submission.');
      } else {
        await setDoc(recRef, {
          ...baseDoc,
          status: 'needs_review',
        });
        Alert.alert('Submitted', 'Your recording was saved');
      }
    } catch (err: any) {
      console.log('Submit failed details:', { name: err?.name, code: err?.code, message: err?.message });
      Alert.alert('Submit failed', err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {backgroundSource ? (
        <ImageBackground
          source={backgroundSource}
          style={styles.background}
          resizeMode="cover"
        >
          <View style={styles.overlay} />
        </ImageBackground>
      ) : (
        <View style={[styles.background, styles.solidBackground]} />
      )}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={28} color="#333" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => Alert.alert('Menu pressed')} style={styles.iconButton}>
            <Ionicons name="menu" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Title - Predicted Species */}
        <Text style={styles.speciesName}>{predictedSpecies}</Text>

        {/* Location Used */}
        {isFinite(lat) && isFinite(lon) && (
          <Text style={styles.locationUsed}>
            Location used: {lat.toFixed(4)}, {lon.toFixed(4)}
          </Text>
        )}

        {loading && <Text style={styles.loadingText}>Running model…</Text>}
        {apiError && <Text style={styles.errorText}>{apiError}</Text>}

        {/* Model Suggestions Card */}
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

        {/* Play/Replay Button */}
        <TouchableOpacity style={styles.actionButton} onPress={handlePlay}>
          <Text style={styles.actionButtonText}>Play / Replay Recording</Text>
        </TouchableOpacity>

        {/* Re-run Model Button */}
        <TouchableOpacity
          style={[styles.actionButton, { marginTop: 10 }]}
          onPress={async () => {
            if (!audioUri) return;
            setLoading(true);
            setApiError(null);
            try {
              const res = await callPredict(
                audioUri,
                isFinite(lat) ? lat : undefined,
                isFinite(lon) ? lon : undefined
              );
              const pct = toPercent(res.confidence);
              setPredictedSpecies(res.species || 'Bullfrog');
              setConfidenceInput(String(Math.round(pct)));
              setTop3(
                (res.top3 ?? []).map((t: any) => ({
                  species: t.species ?? t[0],
                  confidence: toPercent(t.confidence ?? t[1]),
                }))
              );
            } catch (e: any) {
              setApiError(e?.message || 'Prediction failed');
            } finally {
              setLoading(false);
            }
          }}
        >
          <Text style={styles.actionButtonText}>Re-run Model</Text>
        </TouchableOpacity>

        {/* Bottom Card */}
        <View style={styles.bottomCard}>
          {/* Location Button */}
          <TouchableOpacity style={styles.cardButton}>
            <Text style={styles.cardButtonText}>{locationCity}</Text>
          </TouchableOpacity>

          {/* Edit Button */}
          <TouchableOpacity 
            style={[styles.cardButton, styles.editButton]}
            onPress={() => setShowEditOptions(!showEditOptions)}
          >
            <Text style={styles.editButtonText}>edit</Text>
          </TouchableOpacity>

          {/* Edit Options Card (conditionally shown below edit button) */}
          {showEditOptions && (
            <View style={styles.editOptionsCard}>
              {/* Species Picker */}
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

              {/* Confidence Score */}
              <TextInput
                style={styles.editInput}
                value={confidenceInput}
                onChangeText={setConfidenceInput}
                placeholder="Confidence Score"
                placeholderTextColor="#999"
                keyboardType="number-pad"
              />

              {/* Notes */}
              <TextInput
                style={[styles.editInput, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes..."
                placeholderTextColor="#999"
                multiline
              />
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity 
            style={[styles.cardButton, styles.submitButton]}
            onPress={handleSubmit}
          >
            <Text style={styles.submitButtonText}>submit for approval</Text>
          </TouchableOpacity>
        </View>

        {/* Expert Options */}
        {(role === 'expert' || role === 'admin') && (
          <View style={styles.expertBox}>
            <Text style={styles.expertTitle}>Expert Options</Text>
            <TouchableOpacity onPress={() => setSubmitAsExpert(v => !v)} style={styles.expertCheckbox}>
              <Text>{submitAsExpert ? '☑' : '☐'} Submit as expert (skip review)</Text>
            </TouchableOpacity>
            <Text style={styles.expertNote}>
              If enabled, this submission is immediately marked approved with your expert review.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ---------------- API helpers ---------------- */
async function callPredict(uri: string, lat?: number, lon?: number) {
  const mime = guessMime(uri);
  const form = new FormData();
  form.append('file', { uri, name: uri.split('/').pop() || 'clip', type: mime } as any);
  if (typeof lat === 'number') form.append('lat', String(lat));
  if (typeof lon === 'number') form.append('lon', String(lon));

  const endpoints = [
    `${API_BASE}/predict`,
    `${API_BASE}/ml/predict`,
  ];

  let lastErr: any = null;

  for (const url of endpoints) {
    try {
      if (!isHttpUrl(url)) continue;
      console.log('[predict] POST', url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90_000);
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

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  solidBackground: {
    backgroundColor: '#5a7a65',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    marginBottom: 20,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesName: {
    fontSize: 80,
    fontWeight: '600',
    color: '#ccff00',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 100,
  },
  locationUsed: {
    fontSize: 14,
    color: '#ccff00',
    textAlign: 'center',
    marginBottom: 10,
    opacity: 0.8,
  },
  loadingText: {
    fontSize: 16,
    color: '#2d3e34',
    textAlign: 'center',
    marginBottom: 80,
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 80,
  },
  topBox: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    padding: 12,
    marginBottom: 16,
  },
  topHeader: {
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 6,
    fontSize: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  topRowSpecies: {
    fontWeight: '500',
    color: '#333',
  },
  topRowConf: {
    opacity: 0.7,
    color: '#333',
  },
  actionButton: {
    backgroundColor: 'rgba(180, 255, 4, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#000000ff',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#3B483B',
    borderRadius: 20,
    padding: 20,
  },
  cardButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  cardButtonText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#000000ff',
  },
  editButton: {
    backgroundColor: '#4C6052',
    borderWidth: 2,
    borderColor: '#ccff00',
  },
  editButtonText: {
    fontSize: 22,
    fontWeight: '400',
    color: '#fff',
  },
  editOptionsCard: {
    backgroundColor: '#212c26ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pickerContainer: {
    backgroundColor: '#1b1b1bff',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
  },
  editInput: {
    backgroundColor: '#1b1b1bff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#f2f2f2ff',
    marginBottom: 12,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  submitButton: {
    backgroundColor: '#4C6052',
    borderWidth: 2,
    borderColor: '#ccff00',
  },
  submitButtonText: {
    fontSize: 22,
    fontWeight: '400',
    color: '#fff',
  },
  expertBox: {
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 12,
    borderRadius: 10,
  },
  expertTitle: {
    fontWeight: '700',
    marginBottom: 8,
    color: '#2d3e34',
  },
  expertCheckbox: {
    paddingVertical: 6,
  },
  expertNote: {
    opacity: 0.7,
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
});