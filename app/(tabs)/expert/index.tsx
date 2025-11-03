// app/(tabs)/expert/index.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Link, useRouter } from 'expo-router';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../../firebaseConfig';

export default function ExpertDashboard() {
  const router = useRouter(); // ✅ for back nav
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const col = collection(db, 'submissions');
      const [pendingSnap, approvedSnap, rejectedSnap] = await Promise.all([
        getCountFromServer(query(col, where('status', '==', 'pending'))),
        getCountFromServer(query(col, where('status', '==', 'approved'))),
        getCountFromServer(query(col, where('status', '==', 'rejected'))),
      ]);

      setCounts({
        pending: pendingSnap.data().count || 0,
        approved: approvedSnap.data().count || 0,
        rejected: rejectedSnap.data().count || 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCounts();
    }, [loadCounts])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCounts();
    setRefreshing(false);
  }, [loadCounts]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#2d3e34' }}
      contentContainerStyle={{ padding: 16, paddingTop: 64, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4ff00" />
      }
    >
      {/* ✅ Header with Back button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/homeScreen')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.2)',
            marginRight: 12,
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={{ fontSize: 24, fontWeight: '700', color: '#d4ff00' }}>
          Expert Dashboard
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {/* Pending box -> filtered list */}
        <Link
          href={{ pathname: '/(tabs)/expert/submissions-list', params: { status: 'pending' } }}
          asChild
        >
          <Pressable
            style={{ padding: 12, borderRadius: 12, backgroundColor: '#d4ff00', minWidth: 110 }}
          >
            <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>Pending</Text>
            <Text style={{ fontSize: 20, color: '#0a0a0a' }}>{counts.pending}</Text>
          </Pressable>
        </Link>

        {/* Approved */}
        <Link
          href={{ pathname: '/(tabs)/expert/submissions-list', params: { status: 'approved' } }}
          asChild
        >
          <Pressable
            style={{ padding: 12, borderRadius: 12, backgroundColor: '#d4ff00', minWidth: 110 }}
          >
            <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>Approved</Text>
            <Text style={{ fontSize: 20, color: '#0a0a0a' }}>{counts.approved}</Text>
          </Pressable>
        </Link>

        {/* Rejected */}
        <Link
          href={{ pathname: '/(tabs)/expert/submissions-list', params: { status: 'rejected' } }}
          asChild
        >
          <Pressable
            style={{ padding: 12, borderRadius: 12, backgroundColor: '#d4ff00', minWidth: 110 }}
          >
            <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>Rejected</Text>
            <Text style={{ fontSize: 20, color: '#0a0a0a' }}>{counts.rejected}</Text>
          </Pressable>
        </Link>
      </View>

      {loading && <ActivityIndicator color="#d4ff00" />}

      <Link href="/(tabs)/expert/review-queue" asChild>
        <Pressable
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: '#d4ff00',
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>Open Review Queue</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}
