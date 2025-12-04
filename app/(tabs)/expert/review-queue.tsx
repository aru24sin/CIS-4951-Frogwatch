// app/(tabs)/expert/review-queue.tsx
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NavigationMenu from '../../../components/NavigationMenu';
import { auth, db } from '../../firebaseConfig';

type SubmitterInfo = {
  uid?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
};

type Rec = {
  id: string;
  ai?: { species?: string; confidence?: number };
  predictedSpecies?: string;
  status: string;
  timestamp?: any;          // Firestore Timestamp | number | string
  timestamp_iso?: string;   // optional ISO string
  createdAt?: any;          // fallback if present
  locationCity?: string;
  submitter?: SubmitterInfo;
  userId?: string;
};

// Helper: get recording time in ms from various possible fields
const getRecordingTimeMs = (r: Rec): number => {
  const ts: any = r.timestamp;

  // 1. Firestore Timestamp
  if (ts && typeof ts.toDate === 'function') {
    try {
      return ts.toDate().getTime();
    } catch {}
  }

  // 2. Numeric timestamp
  if (typeof ts === 'number') {
    return ts;
  }

  // 3. String timestamp
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }

  // 4. ISO fallback (like timestamp_iso)
  if (typeof r.timestamp_iso === 'string') {
    const d = new Date(r.timestamp_iso);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }

  // 5. createdAt fallback (if some docs use that)
  const ca: any = r.createdAt;
  if (ca && typeof ca.toDate === 'function') {
    try {
      return ca.toDate().getTime();
    } catch {}
  }

  // 6. Default to 0 (will float to the end)
  return 0;
};

// Helper: derive volunteer display name from submitter or fallbacks
const getVolunteerName = (item: Rec): string => {
  const s = item.submitter || ({} as SubmitterInfo);
  const full =
    [s.firstName, s.lastName].filter(Boolean).join(' ') ||
    s.displayName ||
    (s.email ? s.email.split('@')[0] : '');

  if (full) return full;

  if (item.userId) return item.userId;

  // Absolute last fallback: truncated ID
  return item.id.substring(0, 12) + '...';
};

export default function ReviewQueue() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();

  const [items, setItems] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Normalize status param; default to needs_review
  const status = useMemo(() => {
    const raw = (params.status || '').toString().toLowerCase();
    if (raw === 'approved' || raw === 'discarded' || raw === 'needs_review') {
      return raw as 'approved' | 'discarded' | 'needs_review';
    }
    return 'needs_review' as const;
  }, [params.status]);

  const headerTitle = useMemo(() => {
    switch (status) {
      case 'approved':
        return 'Approved Recordings';
      case 'discarded':
        return 'Discarded Recordings';
      default:
        return 'Review Queue';
    }
  }, [status]);

  const statsLabel = useMemo(() => {
    switch (status) {
      case 'approved':
        return `${items.length} recordings approved`;
      case 'discarded':
        return `${items.length} recordings discarded`;
      default:
        return `${items.length} recordings waiting for review`;
    }
  }, [status, items.length]);

  const iconName = useMemo(() => {
    switch (status) {
      case 'approved':
        return 'checkmark-circle-outline';
      case 'discarded':
        return 'close-circle-outline';
      default:
        return 'time-outline';
    }
  }, [status]);

  const iconColor = useMemo(() => {
    switch (status) {
      case 'approved':
        return '#6ee96e';
      case 'discarded':
        return '#FF6B6B';
      default:
        return '#f5a623';
    }
  }, [status]);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const ref = collection(db, 'recordings');

    // Filter by status in Firestore, then sort by date/time on the client
    const q = query(ref, where('status', '==', status), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!auth.currentUser) {
          setItems([]);
          setLoading(false);
          return;
        }
        const rows: Rec[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));

        // Newest → oldest using recording date/time
        rows.sort((a, b) => getRecordingTimeMs(b) - getRecordingTimeMs(a));

        setItems(rows);
        setLoading(false);
        setError(null);
        console.log(
          `Loaded ${rows.length} recordings for status='${status}' (sorted by recording time desc)`
        );
      },
      (err) => {
        if (auth.currentUser) {
          console.error('Review queue query error:', err);
          setError(err.message);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [status]);

  const renderItem = ({ item, index }: { item: Rec; index: number }) => {
    const aiName = item.ai?.species || item.predictedSpecies || '—';
    const aiConf =
      item.ai?.confidence != null
        ? Math.round(Math.max(0, Math.min(1, item.ai.confidence)) * 100)
        : '—';

    const volunteerName = getVolunteerName(item);

    return (
      <Link
        href={{ pathname: './submission/[id]', params: { id: item.id } }}
        asChild
      >
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
              <Text style={styles.confidenceValue}>
                {aiConf !== '—' ? `${aiConf}%` : '—'}
              </Text>
            </View>

            {/* RIGHT SIDE: Volunteer name in white */}
            <View style={styles.cardMeta}>
              <Text style={styles.cardMetaLabel}>Volunteer</Text>
              <Text
                style={styles.cardMetaName}
                numberOfLines={1}
              >
                {volunteerName}
              </Text>
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
      <NavigationMenu
        isVisible={menuVisible}
        onClose={() => setMenuVisible(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={styles.titleUnderline} />
        </View>
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          style={styles.menuButton}
        >
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <Ionicons name={iconName as any} size={20} color={iconColor} />
        <Text style={styles.statsText}>{statsLabel}</Text>
      </View>

      {loading && (
        <ActivityIndicator color="#d4ff00" style={{ marginTop: 20 }} />
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={renderItem}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Ionicons
                name={
                  status === 'discarded'
                    ? 'trash-outline'
                    : status === 'approved'
                    ? 'checkmark-circle'
                    : 'checkmark-circle'
                }
                size={64}
                color={status === 'discarded' ? '#FF6B6B' : '#6ee96e'}
              />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>
                {status === 'approved'
                  ? 'No recordings have been approved yet.'
                  : status === 'discarded'
                  ? 'No recordings have been discarded yet.'
                  : 'No submissions waiting for review.'}
              </Text>
            </View>
          ) : null
        }
      />

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={18} color="#fff" />
          <Text style={styles.errorTextBanner}>
            {error || 'Something went wrong loading recordings.'}
          </Text>
        </View>
      )}
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
    flex: 1,
    marginLeft: 12,
  },
  cardMetaLabel: {
    fontSize: 11,
    color: '#aaa',
    marginBottom: 2,
  },
  cardMetaName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff', // volunteer name in white
    maxWidth: 180,
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
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF6B6B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  errorTextBanner: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
  },
});