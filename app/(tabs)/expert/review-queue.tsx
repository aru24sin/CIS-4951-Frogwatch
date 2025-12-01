// app/(tabs)/expert/review-queue.tsx
import { Link } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { db } from '../../firebaseConfig';

type Rec = {
  id: string;
  ai?: { species?: string; confidence?: number };
  predictedSpecies?: string;
  status: string;
  timestamp?: any;
};

export default function ReviewQueue() {
  const [items, setItems] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, 'recordings');
    const q = query(
      ref,
      where('status', '==', 'needs_review'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows: Rec[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Review Queue</Text>
      {loading && <ActivityIndicator />}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const aiName = item.ai?.species || item.predictedSpecies || '—';
          const aiConf = item.ai?.confidence != null
            ? Math.round(Math.max(0, Math.min(1, item.ai.confidence)) * 100)
            : '—';

          return (
            <Link href={{ pathname: './submission/[id]', params: { id: item.id } }} asChild>
              <Pressable style={{ padding: 12, borderRadius: 12, borderWidth: 1 }}>
                <Text style={{ fontWeight: '600' }}>{aiName}</Text>
                <Text style={{ opacity: 0.8 }}>AI confidence: {aiConf}%</Text>
                <Text style={{ opacity: 0.6, marginTop: 4 }}>ID: {item.id}</Text>
              </Pressable>
            </Link>
          );
        }}
        ListEmptyComponent={
          !loading ? <Text style={{ opacity: 0.7 }}>No submissions waiting for review.</Text> : null
        }
      />
    </View>
  );
}
