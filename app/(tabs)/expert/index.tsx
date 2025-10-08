// app/(tabs)/expert/index.tsx
import { Link } from 'expo-router';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { db } from '../../firebaseConfig';

export default function ExpertDashboard() {
  const [counts, setCounts] = useState({ needs: 0, approved: 0, discarded: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rec = collection(db, 'recordings');
        const needs     = await getCountFromServer(query(rec, where('status','==','needs_review')));
        const approved  = await getCountFromServer(query(rec, where('status','==','approved')));
        const discarded = await getCountFromServer(query(rec, where('status','==','discarded')));
        if (!alive) return;
        setCounts({
          needs: needs.data().count || 0,
          approved: approved.data().count || 0,
          discarded: discarded.data().count || 0,
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Expert Dashboard</Text>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ fontWeight: '600' }}>Needs Review</Text>
          <Text style={{ fontSize: 20 }}>{counts.needs}</Text>
        </View>
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ fontWeight: '600' }}>Approved</Text>
          <Text style={{ fontSize: 20 }}>{counts.approved}</Text>
        </View>
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ fontWeight: '600' }}>Discarded</Text>
          <Text style={{ fontSize: 20 }}>{counts.discarded}</Text>
        </View>
      </View>

      {loading && <ActivityIndicator />}

      <Link href="./review-queue" asChild>
        <Pressable style={{ padding: 14, borderRadius: 12, borderWidth: 1 }}>
          <Text style={{ fontWeight: '600' }}>Open Review Queue</Text>
        </Pressable>
      </Link>
    </View>
  );
}
