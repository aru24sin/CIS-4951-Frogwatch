import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../../firebaseConfig';

type Sub = {
  id: string;
  predictedSpecies?: string;
  confidenceScore?: number; // 0..1
  status: string;
  createdAt?: Timestamp | Date | { seconds: number; nanoseconds: number } | string;
  submitter?: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    uid?: string;
  };
  location?: {
    display?: string;
    lat?: number;
    lng?: number;
  };
};

function formatName(s?: Sub['submitter']) {
  if (!s) return 'Unknown user';
  if (s.displayName && s.displayName.trim()) return s.displayName.trim();
  const full = [s.firstName, s.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return s.email || s.uid || 'Unknown user';
}

function formatDate(d: Sub['createdAt']) {
  try {
    let jsDate: Date | null = null;
    if (!d) return '—';
    if (typeof d === 'string') jsDate = new Date(d);
    // Firestore Timestamp
    // @ts-ignore
    else if (d && typeof d.toDate === 'function') jsDate = (d as Timestamp).toDate();
    // seconds/nanos object
    // @ts-ignore
    else if (typeof d.seconds === 'number') jsDate = new Date((d.seconds as number) * 1000);
    else if (d instanceof Date) jsDate = d;
    if (!jsDate || isNaN(jsDate.getTime())) return '—';
    return jsDate.toLocaleString();
  } catch {
    return '—';
  }
}

function formatCoords(loc?: Sub['location']) {
  if (!loc) return '—';
  const { lat, lng } = loc;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  return '—';
}

export default function SubmissionsList() {
  const router = useRouter();
  const { status = 'pending' } = useLocalSearchParams<{ status?: string }>();
  const [items, setItems] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const col = collection(db, 'submissions');
    const q = query(col, where('status', '==', String(status)), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, (snap) => {
      const rows: Sub[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
      setLoading(false);
    });

    return () => unsub();
  }, [status]);

  return (
    <View style={{ flex: 1, backgroundColor: '#2d3e34', padding: 16, paddingTop: 64 }}>
      {/* ✅ Back Button */}
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/expert')}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.2)',
          marginBottom: 12,
        }}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* ✅ Header */}
      <Text style={{ fontSize: 24, fontWeight: '700', color: '#d4ff00', marginBottom: 16 }}>
        Submissions – {String(status).toUpperCase()}
      </Text>

      {loading && <ActivityIndicator color="#d4ff00" />}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const name = formatName(item.submitter);
          const dateStr = formatDate(item.createdAt);
          const coords = formatCoords(item.location);
          const place = item.location?.display || 'Unknown location';
          const confPct =
            typeof item.confidenceScore === 'number'
              ? Math.round(Math.max(0, Math.min(1, item.confidenceScore)) * 100)
              : '—';
          const species = item.predictedSpecies || '—';

          return (
            <Link
              href={{ pathname: '/(tabs)/expert/submission/[id]', params: { id: item.id } }}
              asChild
            >
              <Pressable
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: '#d4ff00',
                  borderWidth: 1,
                  borderColor: '#d4ff00',
                }}
              >
                <Text style={{ fontWeight: '700', color: '#2d3e34' }}>{name}</Text>
                <Text style={{ opacity: 0.9, color: '#2d3e34' }}>
                  {species} • {confPct}%
                </Text>
                <Text style={{ opacity: 0.8, color: '#2d3e34' }}>{place}</Text>
                <Text style={{ opacity: 0.8, color: '#2d3e34' }}>Coords: {coords}</Text>
                <Text style={{ opacity: 0.7, marginTop: 4, color: '#2d3e34' }}>
                  Submitted: {dateStr}
                </Text>
              </Pressable>
            </Link>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={{ opacity: 0.7, color: '#fff', marginTop: 20 }}>No items.</Text>
          ) : null
        }
      />
    </View>
  );
}
