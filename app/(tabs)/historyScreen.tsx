// app/(tabs)/historyScreen.tsx
import { Audio } from 'expo-av';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, DocumentData, onSnapshot, query, Timestamp, where
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, NativeModules, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import app, { auth, db } from '../firebaseConfig';

type Recording = {
  recordingId: string;
  userId: string;
  predictedSpecies: string;
  species: string;
  audioURL?: string;
  location: { latitude: number; longitude: number };
  status: string;
  timestampISO?: string;
  confidence?: number; // 0–100
  _tsMs?: number
};

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

// Dev API base (only used to play very old /get-audio/... entries)
function pickDevHost() {
  const url: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const m = url?.match(/\/\/([^/:]+):\d+/);
  return m?.[1] ?? 'localhost';
}

const API_BASE = __DEV__ ? `http://${pickDevHost()}:8000` : 'https://your-production-domain'


// Build a playable URL from Firestore doc data
function resolveAudioURL(d: any): string | undefined {
  // Prefer Storage path → public download URL
  const filePath = d?.filePath || (d?.fileName ? `uploaded_audios/${d.fileName}` : undefined);
  if (filePath) {
    const bucket = (app.options as any).storageBucket as string; // e.g. frogwatch-backend.appspot.com
     return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
      filePath
    )}?alt=media`;
  }
  // Fallback: older docs had audioURL like '/get-audio/<file>'
  const a = d?.audioURL;
  if (typeof a === 'string') {
    if (/^https?:\/\//i.test(a)) return a;
    if (a.startsWith('/get-audio/')) return `${API_BASE}${a}`;
  }

  return undefined;
}

export default function HistoryScreen() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  const initialRegion = useMemo(() => {
    const first = recordings[0];
    return {
      latitude: first?.location.latitude ?? 42.3314,
      longitude: first?.location.longitude ?? -83.0458,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }, [recordings]);

  useEffect(() => {
    let offAuth: (() => void) | undefined;
    let offSnap: (() => void) | undefined;

    offAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setRecordings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorText(null);

      const q = query(collection(db, 'recordings'), where('userId', '==', user.uid));

      offSnap = onSnapshot(
        q,
        (snap) => {
          const rows: Recording[] = [];
          snap.forEach((doc) => {
            const d = doc.data() as DocumentData;

            const ts: Timestamp | undefined = d.timestamp;
            const timestampISO =
              ts?.toDate?.()?.toLocaleString?.() ?? d.timestamp_iso ?? undefined;

            rows.push({
              recordingId: d.recordingId ?? doc.id,
              userId: d.userId ?? '',
              predictedSpecies: d.predictedSpecies ?? '',
              species: d.species ?? '',
              audioURL: resolveAudioURL(d),
              location: {
                latitude: Number(d?.location?.lat) || 0,
                longitude: Number(d?.location?.lng) || 0,
              },
              status: d.status ?? 'pending_analysis',
              timestampISO,
              confidence:
                typeof d.confidenceScore === 'number'
                  ? Math.round(d.confidenceScore * 100)
                  : undefined,
            });
          });

          setRecordings(rows);
          setLoading(false);
        },
        (err) => {
          setErrorText(err?.message || String(err));
          setRecordings([]);
          setLoading(false);
        }
      );
    });

    return () => {
      offSnap?.();
      offAuth?.();
      sound?.unloadAsync().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlay = async (uri?: string) => {
    if (!uri) return;
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (e) {
      console.error('Audio play error:', e);
    }
  };

  const handleSelect = (rec: Recording) => {
    setSelectedId(rec.recordingId);
    mapRef.current?.animateToRegion({
      ...rec.location,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  const renderItem = ({ item }: { item: Recording }) => {
    const img = speciesImageMap[item.predictedSpecies] || placeholderImage;
    return (
      <TouchableOpacity onPress={() => handleSelect(item)}>
        <View
          style={[
            styles.card,
            selectedId === item.recordingId && { borderColor: '#FF9500', borderWidth: 2 },
          ]}
        >
          <Image source={img} style={styles.image} />
          <Text style={styles.title}>{item.predictedSpecies || '(Unknown species)'}</Text>
          <Text style={styles.rowText}>Confidence: {item.confidence ?? 'N/A'}%</Text>
          <Text style={styles.rowText}>Status: {item.status}</Text>
          {!!item.timestampISO && <Text style={styles.rowText}>Time: {item.timestampISO}</Text>}
          <Text style={styles.rowText}>
            Location: {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => handlePlay(item.audioURL)}>
            <Text style={styles.buttonText}>Play / Replay</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  return (
    <View style={styles.container}>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      <View style={styles.mapContainer}>
        <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion}>
          {recordings.map((rec) => (
            <Marker
              key={rec.recordingId}
              coordinate={rec.location}
              title={rec.predictedSpecies}
              description={`Confidence: ${rec.confidence ?? 'N/A'}%`}
              pinColor={rec.recordingId === selectedId ? 'orange' : 'red'}
              onPress={() => handleSelect(rec)}
            />
          ))}
        </MapView>
      </View>

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.recordingId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator
        persistentScrollbar
        indicatorStyle="white"
        ListEmptyComponent={
          <Text style={{ padding: 16, textAlign: 'center', color: '#fff' }}>
            No recordings yet. Make one from the Record screen!
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // match RecordScreen look/feel
  container: { flex: 1, backgroundColor: '#3F5A47', alignItems: 'center' },

  // same embed style as RecordScreen
  mapContainer: { width: 370, height: 300, borderRadius: 20, overflow: 'hidden', marginTop: 40, marginBottom: 15 },
  map: { flex: 1 },

  listContent: { padding: 35, paddingBottom: 24, width: '100%' },

  error: { padding: 12, color: '#ffdddd', textAlign: 'center' },

  card: {
    backgroundColor: '#f0f8ff',
    padding: 5,
    borderRadius: 5,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#007AFF',
    width: '110%',
    alignSelf: 'center',
  },
  image: { width: '100%', height: 180, borderRadius: 8 },
  title: { fontSize: 30, fontWeight: '400', marginVertical: 5 },
  rowText: { color: '#1b1b1b' },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
