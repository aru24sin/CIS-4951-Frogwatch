// app/(tabs)/historyScreen.tsx
import { Audio } from 'expo-av';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

// Firebase
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// ------- dev sign-in (optional; remove if you already auth elsewhere) -------
const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_EMAIL || 'vnitu393@gmail.com';
const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_PASSWORD || 'hello123';

// ------- dynamic API base  -------
function pickDevHost(): string {
  const hostUri =
    (global as any)?.expo?.hostUri ??
    (global as any)?.expoGoConfig?.hostUri ??
    (NativeModules as any)?.SourceCode?.scriptURL?.replace(/^.*\/\/([^:/]+).*$/, '$1') ??
    '';
  if (hostUri) {
    const h = String(hostUri).split(':')[0];
    if (h) return h;
  }
  const scriptURL: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const m = scriptURL?.match(/\/\/([^/:]+):\d+/);
  return m?.[1] ?? 'localhost';
}
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || (__DEV__ ? `http://${pickDevHost()}:8000` : 'https://your-production-domain');

// ------- types -------
type UIRecording = {
  recordingId: string;
  userId: string;
  predictedSpecies: string;
  species: string; // confirmed (can be '')
  confidencePercent?: number; // 0..100
  audioURL: string; // fully-qualified
  location: { latitude: number; longitude: number };
  status: string;
  timestampText: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
};

const speciesImageMap: Record<string, any> = {
  'Bullfrog': require('../../assets/frogs/bullfrog.png'),
  'Green Frog': require('../../assets/frogs/treefrog.png'),
  'Northern Spring Peeper': require('../../assets/frogs/spring_peeper.png'),
  'Northern Leopard Frog': require('../../assets/frogs/northern_leopard.png'),
  'Eastern Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
  'Wood Frog': require('../../assets/frogs/wood_frog.png'),
  'American Toad': require('../../assets/frogs/american_toad.png'),
  'Midland Chorus Frog': require('../../assets/frogs/midland_chorus.png'),
};
const placeholderImage = require('../../assets/frogs/placeholder.png');

export default function HistoryScreen() {
  const [items, setItems] = useState<UIRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      // dev sign-in (remove if you already login earlier in the app)
      if (!auth.currentUser) {
        try {
          await signInWithEmailAndPassword(auth, DEV_EMAIL, DEV_PASSWORD);
        } catch {
          // ignore if it fails and user is already logged in another way
        }
      }
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setLoading(false);
        return;
      }

      // listen to this user's recordings newest first
      const q = query(
        collection(db, 'recordings'),
        where('userId', '==', uid),
        orderBy('timestamp', 'desc')
      );

      const unsub = onSnapshot(q, (snap) => {
        const mapped = snap.docs.map((d) => toUI(d.id, d.data()));
        setItems(mapped);
        if (!selectedId && mapped[0]) setSelectedId(mapped[0].recordingId);
        setLoading(false);
      }, (err) => {
        console.warn('History onSnapshot error', err);
        setLoading(false);
      });

      return () => unsub();
    })();

    return () => {
      if (sound) sound.unloadAsync().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speciesCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of items) {
      const key = r.species || r.predictedSpecies || 'Unknown';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const handlePlay = async (uri: string) => {
    try {
      if (sound) await sound.unloadAsync();
      const { sound: s } = await Audio.Sound.createAsync({ uri });
      setSound(s);
      await s.playAsync();
    } catch (e) {
      console.error('play failed', e);
    }
  };

  const selectCard = (rec: UIRecording) => {
    setSelectedId(rec.recordingId);
    mapRef.current?.animateToRegion({
      ...rec.location,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
  };

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  const first = items[0];
  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ height: 300 }}
        initialRegion={{
          latitude: first?.location.latitude ?? 0,
          longitude: first?.location.longitude ?? 0,
          latitudeDelta: 5,
          longitudeDelta: 5,
        }}
      >
        {items.map((r) => (
          <Marker
            key={r.recordingId}
            coordinate={r.location}
            title={r.species || r.predictedSpecies}
            description={`Confidence: ${r.confidencePercent ?? 'N/A'}%`}
            pinColor={r.recordingId === selectedId ? 'orange' : 'red'}
          />
        ))}
      </MapView>

      {speciesCounts.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }}
        >
          {speciesCounts.map(([name, count]) => (
            <View key={name} style={styles.chip}>
              <Text style={styles.chipText}>{name} • {count}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.recordingId}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => {
          const img = speciesImageMap[item.predictedSpecies] ?? placeholderImage;
          return (
            <TouchableOpacity onPress={() => selectCard(item)}>
              <View style={[
                styles.card,
                selectedId === item.recordingId && { borderColor: '#FF9500', borderWidth: 2 },
              ]}>
                <Image source={img} style={styles.image} />
                <Text style={styles.title}>
                  {item.species || item.predictedSpecies}
                  {item.species && item.species !== item.predictedSpecies
                    ? ` (model: ${item.predictedSpecies})` : ''}
                </Text>
                <Text>Confidence: {item.confidencePercent ?? 'N/A'}%</Text>
                <Text>Status: {item.status || 'pending'}</Text>
                <Text>Time: {item.timestampText}</Text>
                <Text>
                  Location: {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
                </Text>
                {!!(item.firstName || item.lastName || item.displayName) && (
                  <Text>By: {`${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || item.displayName}</Text>
                )}
                <TouchableOpacity style={styles.button} onPress={() => handlePlay(item.audioURL)}>
                  <Text style={styles.buttonText}>Play / Replay</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

/* --------------- mapping helpers  --------------- */
function toUI(id: string, data: any): UIRecording {
  const lat =
    data?.location?.lat ??
    data?.location?.latitude ?? 0;
  const lng =
    data?.location?.lng ??
    data?.location?.longitude ?? 0;

  // Firestore serverTimestamp comes back as Timestamp or null until resolved
  let timestampText = '';
  const ts = data?.timestamp;
  if (ts instanceof Timestamp) {
    timestampText = ts.toDate().toLocaleString();
  } else if (typeof data?.timestamp_iso === 'string') {
    timestampText = new Date(data.timestamp_iso).toLocaleString();
  } else {
    timestampText = new Date().toLocaleString();
  }

  const confidencePercent =
    typeof data?.confidencePercent === 'number'
      ? Math.round(data.confidencePercent)
      : typeof data?.confidenceScore === 'number'
        ? Math.round(data.confidenceScore * 100)
        : undefined;

  // audioURL: if it’s backend path (“/get-audio/...”), prefix with API_BASE
  let audioURL: string = data?.audioURL || '';
  if (audioURL && audioURL.startsWith('/')) {
    audioURL = `${API_BASE}${audioURL}`;
  }

  return {
    recordingId: data?.recordingId || id,
    userId: data?.userId || data?.createdBy || '',
    predictedSpecies: data?.predictedSpecies || '',
    species: data?.species || '',
    confidencePercent,
    audioURL,
    location: { latitude: Number(lat) || 0, longitude: Number(lng) || 0 },
    status: data?.status || 'pending_analysis',
    timestampText,
    displayName: data?.displayName,
    firstName: data?.firstName,
    lastName: data?.lastName,
  };
}

/* ----------------------------- styles ----------------------------- */
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f0f8ff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  image: { width: '100%', height: 180, borderRadius: 8 },
  title: { fontSize: 18, fontWeight: '600', marginVertical: 5 },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  chip: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  chipText: { color: '#2E7D32', fontWeight: '600' },
});
