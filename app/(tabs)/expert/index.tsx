// app/(tabs)/expert/index.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Link, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NavigationMenu from '../../../components/NavigationMenu';
import { auth, db } from '../../firebaseConfig';

// Helper function to get the correct home screen based on user role
const getHomeScreen = async (): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) return './expertHomeScreen';

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data() || {};

    // Check both role field (string) and boolean fields for compatibility
    const roleStr = (userData.role || '').toString().toLowerCase();
    const isAdmin = userData.isAdmin === true || roleStr === 'admin';
    const isExpert = userData.isExpert === true || roleStr === 'expert';

    if (isAdmin) return '../adminHomeScreen';
    if (isExpert) return '../expertHomeScreen';
    return '../volunteerHomeScreen';
  } catch {
    return '../expertHomeScreen';
  }
};

export default function ExpertDashboard() {
  const router = useRouter();
  const [counts, setCounts] = useState({
    needs: 0,
    approved: 0,
    discarded: 0,
  });
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [homeScreen, setHomeScreen] = useState<string>('../expertHomeScreen');

  useEffect(() => {
    getHomeScreen().then(setHomeScreen);
  }, []);

  // ---- Load counts (needs_review / approved / discarded) ----
  const loadCounts = useCallback(async () => {
    let alive = true;
    try {
      const rec = collection(db, 'recordings');

      // predictionScreen uses 'needs_review' for new submissions
      const needsReview = await getCountFromServer(
        query(rec, where('status', '==', 'needs_review'))
      );
      const approved = await getCountFromServer(
        query(rec, where('status', '==', 'approved'))
      );
      const discarded = await getCountFromServer(
        query(rec, where('status', '==', 'discarded'))
      );

      if (!alive) return;
      setCounts({
        needs: needsReview.data().count || 0,
        approved: approved.data().count || 0,
        discarded: discarded.data().count || 0,
      });

      console.log('Counts loaded:', {
        needs_review: needsReview.data().count,
        approved: approved.data().count,
        discarded: discarded.data().count,
      });
    } catch (error) {
      console.error('Error fetching counts:', error);
    } finally {
      if (alive) setLoading(false);
    }

    return () => {
      alive = false;
    };
  }, []);

  // Refresh counts whenever this screen regains focus
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      const cleanup = loadCounts();
      return () => {
        // if loadCounts returned a cleanup, call it
        //if (typeof cleanup === 'function') cleanup();
      };
    }, [loadCounts])
  );

  // Navigate to review queue with a status filter
  const openQueue = (status: 'needs_review' | 'approved' | 'discarded') => {
    router.push({
      pathname: '/(tabs)/expert/review-queue',
      params: { status },
    } as any);
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
          onPress={() => router.push(homeScreen as any)}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Expert Dashboard</Text>
          <View style={styles.titleUnderline} />
        </View>
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          style={styles.menuButton}
        >
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        {/* Needs Review (clickable) */}
        <TouchableOpacity
          style={[styles.statCard, styles.needsCard]}
          activeOpacity={0.85}
          onPress={() => openQueue('needs_review')}
        >
          <View style={styles.statIconContainer}>
            <Ionicons name="time-outline" size={24} color="#f5a623" />
          </View>
          <Text style={styles.statLabel}>Review</Text>
          <Text style={[styles.statNumber, { color: '#f5a623' }]}>
            {counts.needs}
          </Text>
        </TouchableOpacity>

        {/* Approved (clickable) */}
        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.85}
          onPress={() => openQueue('approved')}
        >
          <View style={styles.statIconContainer}>
            <Ionicons
              name="checkmark-circle-outline"
              size={24}
              color="#6ee96e"
            />
          </View>
          <Text style={styles.statLabel}>Approved</Text>
          <Text style={[styles.statNumber, { color: '#6ee96e' }]}>
            {counts.approved}
          </Text>
        </TouchableOpacity>

        {/* Discarded (clickable) */}
        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.85}
          onPress={() => openQueue('discarded')}
        >
          <View style={styles.statIconContainer}>
            <Ionicons
              name="close-circle-outline"
              size={24}
              color="#FF6B6B"
            />
          </View>
          <Text style={styles.statLabel}>Discarded</Text>
          <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>
            {counts.discarded}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator color="#d4ff00" style={{ marginTop: 20 }} />
      )}

      {/* Action Button – defaults to needs_review queue */}
      <Link
        href={{
          pathname: '/(tabs)/expert/review-queue',
          params: { status: 'needs_review' },
        }}
        asChild
      >
        <Pressable style={styles.queueButton}>
          <View style={styles.queueButtonContent}>
            <Ionicons name="list" size={24} color="#2d3e34" />
            <View style={styles.queueButtonTextContainer}>
              <Text style={styles.queueButtonTitle}>Open Review Queue</Text>
              <Text style={styles.queueButtonSubtitle}>
                {counts.needs} recordings waiting for review
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#2d3e34" />
        </Pressable>
      </Link>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color="#d4ff00" />
        <Text style={styles.infoText}>
          As an expert, you can review and verify frog recordings submitted by
          volunteers. Your expertise helps improve data quality for
          conservation research.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3F5A47',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    marginBottom: 30,
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
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  needsCard: {
    borderColor: '#f5a623',
  },
  statIconContainer: {
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 4,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
  },
  queueButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  queueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  queueButtonTextContainer: {
    gap: 2,
  },
  queueButtonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2d3e34',
  },
  queueButtonSubtitle: {
    fontSize: 13,
    color: '#3d4f44',
  },
  infoCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.2)',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
});