// app/(tabs)/expert/review-queue.tsx
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import NavigationMenu from '../../../components/NavigationMenu';
import { auth, db } from '../../firebaseConfig';

type Rec = {
  id: string;
  ai?: { species?: string; confidence?: number };
  predictedSpecies?: string;
  status: string;
  timestamp?: any;
  locationCity?: string;
};

export default function ReviewQueue() {
  const router = useRouter();
  const [items, setItems] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is authenticated before setting up listener
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    // Query for recordings that need review
    // predictionScreen sets status to 'needs_review' when submitting
    const ref = collection(db, 'recordings');
    
    const q = query(
      ref,
      where('status', '==', 'needs_review'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q, 
      (snap) => {
        // Double-check user is still logged in
        if (!auth.currentUser) {
          setItems([]);
          setLoading(false);
          return;
        }
        const rows: Rec[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        setItems(rows);
        setLoading(false);
        setError(null);
        console.log(`Loaded ${rows.length} recordings needing review`);
      },
      (err) => {
        // Only log error if user is still logged in
        if (auth.currentUser) {
          console.error('Review queue query error:', err);
          setError(err.message);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const renderItem = ({ item, index }: { item: Rec; index: number }) => {
    const aiName = item.ai?.species || item.predictedSpecies || '—';
    const aiConf = item.ai?.confidence != null
      ? Math.round(Math.max(0, Math.min(1, item.ai.confidence)) * 100)
      : '—';

    return (
      <Link href={{ pathname: './submission/[id]', params: { id: item.id } }} asChild>
        <Pressable style={styles.recordingCard}>
          <View style={styles.cardHeader}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>#{index + 1}</Text>
            </View>
            <View style={styles.speciesTag}>
              <Text style={styles.speciesTagText}>{aiName}</Text>
            </View>
          </View>
          
          <View style={styles.cardContent}>
            <View style={styles.confidenceContainer}>
              <Text style={styles.confidenceLabel}>AI Confidence</Text>
              <Text style={styles.confidenceValue}>{aiConf}%</Text>
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.cardMetaText} numberOfLines={1}>ID: {item.id.substring(0, 12)}...</Text>
            </View>
          </View>
          
          <View style={styles.cardFooter}>
            <Ionicons name="chevron-forward" size={24} color="#d4ff00" />
          </View>
        </Pressable>
      </Link>
    );
  };

  return (
    <View style={styles.container}>
      <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Review Queue</Text>
          <View style={styles.titleUnderline} />
        </View>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <Ionicons name="time-outline" size={20} color="#f5a623" />
        <Text style={styles.statsText}>{items.length} recordings waiting for review</Text>
      </View>

      {loading && <ActivityIndicator color="#d4ff00" style={{ marginTop: 20 }} />}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={renderItem}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={64} color="#6ee96e" />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptyText}>No submissions waiting for review.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3F5A47',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    marginBottom: 20,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  titleUnderline: {
    height: 3,
    backgroundColor: '#d4ff00',
    marginTop: 4,
    borderRadius: 2,
  },
  menuButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d3e34',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  statsText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  recordingCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  numberBadge: {
    backgroundColor: '#3d4f44',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  numberBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaa',
  },
  speciesTag: {
    backgroundColor: '#d4ff00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  speciesTagText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2d3e34',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  confidenceContainer: {
    gap: 2,
  },
  confidenceLabel: {
    fontSize: 12,
    color: '#aaa',
  },
  confidenceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  cardMeta: {
    alignItems: 'flex-end',
  },
  cardMetaText: {
    fontSize: 12,
    color: '#888',
  },
  cardFooter: {
    alignItems: 'flex-end',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  emptyText: {
    fontSize: 14,
    color: '#aaa',
  },
});
