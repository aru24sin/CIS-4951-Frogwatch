// app/(tabs)/expert/index.tsx
import { Link } from 'expo-router';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { db } from "../../firebaseConfig";

export default function ExpertDashboard() {
  const [counts, setCounts] = useState({ needs: 0, approved: 0, discarded: 0 });

  useEffect(() => {
    (async () => {
      const rec = collection(db, 'recordings');
      const needs = await getCountFromServer(query(rec, where('status','==','needs_review')));
      const approved = await getCountFromServer(query(rec, where('status','==','approved')));
      const discarded = await getCountFromServer(query(rec, where('status','==','discarded')));
      setCounts({
        needs: needs.data().count,
        approved: approved.data().count,
        discarded: discarded.data().count,
      });
    })();
  }, []);

  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Expert Dashboard</Text>
      <Text>Needs Review: {counts.needs}</Text>
      <Text>Approved (all time): {counts.approved}</Text>
      <Text>Discarded (all time): {counts.discarded}</Text>

      <Link href="./review-queue" asChild>
        <Pressable style={{ padding: 12, borderRadius: 12, borderWidth: 1 }}>
          <Text>Open Review Queue</Text>
        </Pressable>
      </Link>

      {/* Optional: implement this screen or remove the button */}
      <Link href="./settings" asChild>
        <Pressable style={{ padding: 12, borderRadius: 12, borderWidth: 1 }}>
          <Text>Expert Settings</Text>
        </Pressable>
      </Link>
    </View>
  );
}
