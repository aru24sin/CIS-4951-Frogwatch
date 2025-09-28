// app/(tabs)/expert/review-queue.tsx
import { Link } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { db } from '../../firebaseConfig';

type Rec = {
  id: string;
  ai?: { species?: string; confidence?: number };
  predictedSpecies?: string;
  status: string;
  timestamp?: any; // serverTimestamp written on create
};

export default function ReviewQueue() {
  const [items, setItems] = useState<Rec[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'recordings'),
      where('status', '==', 'needs_review'), // only queued items
      orderBy('timestamp', 'desc'),          // newest first
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, []);

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12 }}>Review Queue</Text>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => {
          const aiName = item.ai?.species ?? item.predictedSpecies ?? '—';
          const aiConf = Math.round(((item.ai?.confidence ?? 0) * 100));
          return (
            <Link href={`./submission/${item.id}`} asChild>
              <Pressable style={{ padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 }}>
                <Text>ID: {item.id}</Text>
                <Text>AI: {aiName} ({aiConf}%)</Text>
                <Text>Status: {item.status}</Text>
              </Pressable>
            </Link>
          );
        }}
        ListEmptyComponent={
          <Text style={{ opacity: 0.7 }}>No submissions waiting for review.</Text>
        }
      />
    </View>
  );
}
