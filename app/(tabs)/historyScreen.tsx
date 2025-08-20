// app/(tabs)/historyScreen.tsx
import { Audio } from 'expo-av';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  DocumentData,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { auth, db } from '../firebaseConfig';

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
};

const speciesImageMap: Record<string, any> = {
  'American Bullfrog': require('../../assets/frogs/bullfrog.png'),
  'Green Treefrog': require('../../assets/frogs/treefrog.png'),
  'Spring Peeper': require('../../assets/frogs/spring_peeper.png'),
  'Northern Leopard Frog': require('../../assets/frogs/northern_leopard.png'),
  'Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
  'Eastern Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
};
const placeholderImage = require('../../assets/frogs/placeholder.png');

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
      latitudeDelta: 5,
      longitudeDelta: 5,
    };
  }, [recordings]);

  useEffect(() => {
    let offAuth: (() => void) | undefined;
    let offSnap: (() => void) | undefined;

    offAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        console.log('[history] no user, clearing list');
        setRecordings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorText(null);
      console.log('[history] querying for uid =', user.uid);

      // IMPORTANT: match your write code — make sure every doc has userId = uid
      const q = query(
        collection(db, 'recordings'),
        where('userId', '==', user.uid)
      );

      offSnap = onSnapshot(
        q,
        (snap) => {
          const rows: Recording[] = [];
          snap.forEach((doc) => {
            const d = doc.data() as DocumentData;

            const ts: Timestamp | undefined = d.timestamp;
            const timestampISO =
              ts?.toDate?.()?.toLocaleString?.() ??
              d.timestamp_iso ??
              undefined;

            rows.push({
              recordingId: d.recordingId ?? doc.id,
              userId: d.userId ?? '',
              predictedSpecies: d.predictedSpecies ?? '',
              species: d.species ?? '',
              audioURL: d.audioURL,
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

          console.log(`[history] got ${rows.length} rec(s)`);
          setRecordings(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[history] snapshot error:', err);
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
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
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
          <Text>Confidence: {item.confidence ?? 'N/A'}%</Text>
          <Text>Status: {item.status}</Text>
          {!!item.timestampISO && <Text>Time: {item.timestampISO}</Text>}
          <Text>
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
    <View style={{ flex: 1 }}>
      {errorText ? (
        <Text style={{ padding: 12, color: '#c00' }}>{errorText}</Text>
      ) : null}

      <MapView ref={mapRef} style={{ height: 300 }} initialRegion={initialRegion}>
        {recordings.map((rec) => (
          <Marker
            key={rec.recordingId}
            coordinate={rec.location}
            title={rec.predictedSpecies}
            description={`Confidence: ${rec.confidence ?? 'N/A'}%`}
            pinColor={rec.recordingId === selectedId ? 'orange' : 'red'}
          />
        ))}
      </MapView>

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.recordingId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10 }}
        ListEmptyComponent={
          <Text style={{ padding: 16, textAlign: 'center' }}>
            No recordings yet. Make one from the Record screen!
          </Text>
        }
      />
    </View>
  );
}

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
});
