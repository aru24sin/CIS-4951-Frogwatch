// app/(tabs)/expert/submission/[id].tsx
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import NavigationMenu from '../../../../components/NavigationMenu';
import { auth, db, storage } from '../../../firebaseConfig';

type RecordingDoc = {
  userId: string;
  status: 'needs_review' | 'approved' | 'discarded';
  timestamp?: any;

  // volunteer choices
  species?: string;
  confidenceScore?: number;
  notes?: string;
  volunteerConfidenceLevel?: 'high' | 'medium' | 'low' | string;

  // audio info
  audioUrl?: string;
  audioPath?: string;
  storagePath?: string;
  audioStoragePath?: string;
  audioFilePath?: string;
  filePath?: string;
  audioURL?: string;

  // AI info
  ai?: { species?: string; confidence?: number };
  aiSpecies?: string;
  aiConfidence?: number;
  predictedSpecies?: string;
  confidence?: number;

  // expert overrides
  expertSpecies?: string;
  expertConfidence?: number;
  expertNotes?: string;

  // location-ish fields
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  location?: { lat?: number; lng?: number; city?: string };
  locationCity?: string;
  city?: string;
};

const speciesOptions = [
  'Bullfrog',
  'Green Frog',
  'Northern Spring Peeper',
  'Northern Leopard Frog',
  'Eastern Gray Treefrog',
  'Wood Frog',
  'American Toad',
  'Midland Chorus Frog',
];

export default function ExpertSubmissionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const [record, setRecord] = useState<RecordingDoc | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [volunteerName, setVolunteerName] = useState<string | null>(null);
  const [recordedAtStr, setRecordedAtStr] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);

  // These now represent the **volunteer’s** choices (read-only in UI)
  const [species, setSpecies] = useState('');
  const [confidenceStr, setConfidenceStr] = useState('');
  const [notes, setNotes] = useState('');
  const [volunteerConfidenceLevel, setVolunteerConfidenceLevel] =
    useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  const aiSpecies = useMemo(
    () =>
      record?.ai?.species ||
      record?.aiSpecies ||
      record?.predictedSpecies ||
      '',
    [record]
  );

  const aiConfidencePct = useMemo(() => {
    const c =
      record?.ai?.confidence ??
      record?.aiConfidence ??
      record?.confidence ??
      null;
    if (typeof c === 'number' && !Number.isNaN(c)) {
      return Math.round(Math.max(0, Math.min(1, c)) * 100);
    }
    return null;
  }, [record]);

  // Load doc + volunteer name + date/time + location + audio URL
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!id) {
          Alert.alert('Missing ID', 'No submission id provided.');
          return;
        }

        const ref = doc(db, 'recordings', id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          Alert.alert('Not found', 'Submission does not exist.');
          return;
        }

        const raw = snap.data() as any;
        console.log('Expert review recording doc:', raw);

        const data = raw as RecordingDoc;
        if (!alive) return;
        setRecord(data);

        // --- Volunteer species / confidence / notes (read-only UI) ---
        const volunteerSpecies =
          (data.species || '').trim() ||
          (data.expertSpecies || '').trim() ||
          (data.aiSpecies || '').trim() ||
          (data.predictedSpecies || '').trim();

        setSpecies(volunteerSpecies);

        const volunteerConfPct =
          data.confidenceScore != null
            ? Math.round(Number(data.confidenceScore) * 100)
            : data.expertConfidence != null
            ? Math.round(Number(data.expertConfidence) * 100)
            : aiConfidencePct ?? '';

        setConfidenceStr(
          volunteerConfPct === '' || volunteerConfPct == null
            ? ''
            : String(volunteerConfPct)
        );

        setNotes(data.notes || data.expertNotes || '');

        const volLevel =
          (raw.volunteerConfidenceLevel as string | undefined) ??
          (data.volunteerConfidenceLevel as string | undefined) ??
          null;
        setVolunteerConfidenceLevel(
          volLevel ? volLevel.toString().trim() : null
        );

        // --- Date / time ---
        let jsDate: Date | null = null;
        const ts: any = data.timestamp;
        if (ts?.toDate && typeof ts.toDate === 'function') {
          jsDate = ts.toDate();
        } else if (typeof ts === 'number') {
          jsDate = new Date(ts);
        } else if (typeof ts === 'string') {
          const parsed = new Date(ts);
          if (!Number.isNaN(parsed.getTime())) jsDate = parsed;
        }

        if (jsDate && alive) {
          const formatted = jsDate.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          setRecordedAtStr(formatted);
        }

        // --- Volunteer name ---
        const ownerUid =
          data.userId ||
          raw.userId ||
          raw.createdBy ||
          raw.submitter?.uid;
        if (ownerUid) {
          try {
            const userSnap = await getDoc(doc(db, 'users', ownerUid));
            if (userSnap.exists()) {
              const u = userSnap.data() as any;
              const first = (u.firstName || u.firstname || '')
                .toString()
                .trim();
              const last = (u.lastName || u.lastname || '')
                .toString()
                .trim();
              const display =
                [first, last].filter(Boolean).join(' ') ||
                (u.displayName as string) ||
                (u.email?.split('@')[0] as string) ||
                'Volunteer';
              if (alive) setVolunteerName(display);
            }
          } catch (e) {
            console.warn('Failed to load volunteer name:', e);
          }
        }

        // --- Location / mini map (location: { lat, lng }) ---
        const loc = raw.location || data.location;
        let lat: number | undefined =
          typeof data.latitude === 'number'
            ? data.latitude
            : typeof data.lat === 'number'
            ? data.lat
            : loc && typeof loc.lat === 'number'
            ? loc.lat
            : undefined;

        let lng: number | undefined =
          typeof data.longitude === 'number'
            ? data.longitude
            : typeof data.lng === 'number'
            ? data.lng
            : loc && typeof loc.lng === 'number'
            ? loc.lng
            : undefined;

        if (
          typeof lat === 'number' &&
          !Number.isNaN(lat) &&
          typeof lng === 'number' &&
          !Number.isNaN(lng)
        ) {
          const region: Region = {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          };
          if (alive) setMapRegion(region);
        }

        // --- Audio URL (Storage path: filePath) ---
        let resolvedUrl: string | null = null;

        if (
          typeof data.audioUrl === 'string' &&
          data.audioUrl.startsWith('http')
        ) {
          resolvedUrl = data.audioUrl;
        } else if (
          typeof raw.audioURL === 'string' &&
          raw.audioURL.startsWith('http')
        ) {
          resolvedUrl = raw.audioURL;
        } else {
          const path: string | undefined =
            data.filePath ||
            raw.filePath ||
            data.audioPath ||
            raw.audioPath ||
            data.storagePath ||
            raw.storagePath ||
            data.audioStoragePath ||
            raw.audioStoragePath ||
            data.audioFilePath ||
            raw.audioFilePath;

          if (path) {
            try {
              resolvedUrl = await getDownloadURL(storageRef(storage, path));
            } catch (e) {
              console.warn('Failed to get audio download URL:', e);
            }
          }
        }

        if (!alive) return;
        setAudioUrl(resolvedUrl || null);
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to load submission.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, aiConfidencePct]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      (async () => {
        if (soundRef.current) {
          try {
            await soundRef.current.unloadAsync();
          } catch {}
          soundRef.current = null;
        }
      })();
    };
  }, []);

  const loadAndPlay = useCallback(async () => {
    if (!audioUrl) return;

    if (soundRef.current && playing) {
      try {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    if (soundRef.current && !playing) {
      try {
        await soundRef.current.playAsync();
        setPlaying(true);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setPlaying(false);
        }
      });
      await sound.playAsync();
      setPlaying(true);
    } catch (e) {
      console.error(e);
      Alert.alert('Playback error', 'Could not play the audio file.');
    }
  }, [audioUrl, playing]);

  // Zoom handlers for mini map
  const handleZoom = (factor: number) => {
    setMapRegion((prev) => {
      if (!prev) return prev;
      const newLatDelta = Math.min(
        Math.max(prev.latitudeDelta * factor, 0.001),
        1
      );
      const newLngDelta = Math.min(
        Math.max(prev.longitudeDelta * factor, 0.001),
        1
      );
      return {
        ...prev,
        latitudeDelta: newLatDelta,
        longitudeDelta: newLngDelta,
      };
    });
  };

  const zoomIn = () => handleZoom(0.5);
  const zoomOut = () => handleZoom(2);

  // Firestore write for approve/discard
  async function writeAudit(action: 'approved' | 'discarded') {
    if (!id) throw new Error('Missing recording id');

    const user = auth.currentUser;
    if (!user) {
      throw new Error('You must be logged in to review submissions.');
    }

    const reviewerId = user.uid;

    // convert volunteer confidence string to 0–1 range; still stored as expertConfidence
    const confPct =
      confidenceStr.trim() === '' ? null : Number(confidenceStr);
    const conf01 =
      confPct == null || Number.isNaN(confPct)
        ? null
        : Math.max(0, Math.min(100, confPct)) / 100;

    console.log(`Attempting to ${action} recording ${id}...`);

    try {
      await addDoc(collection(db, 'recordings', id, 'reviews'), {
        action,
        species: species?.trim() || null,
        confidence: conf01,
        reviewerId,
        notes: notes?.trim() || null,
        createdAt: serverTimestamp(),
      });

      const updates: Record<string, any> = {
        status: action,
        reviewedAt: serverTimestamp(),
        reviewedBy: reviewerId,
      };

      if (species?.trim()) updates.expertSpecies = species.trim();
      if (conf01 !== null) updates.expertConfidence = conf01;
      if (notes?.trim()) updates.expertNotes = notes.trim();

      await updateDoc(doc(db, 'recordings', id), updates);
      console.log(`Recording ${id} status updated to '${action}'`);
    } catch (error: any) {
      console.error('Firestore update failed:', error);
      throw new Error(
        error?.message || 'Failed to update recording in database'
      );
    }
  }

  async function onSave() {
    if (saving) return;
    if (!species?.trim()) {
      Alert.alert(
        'Missing species',
        'Volunteer did not provide a species name.'
      );
      return;
    }
    setSaving(true);
    try {
      await writeAudit('approved');
      Alert.alert('Saved', 'Your review has been recorded.');
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not save review.');
    } finally {
      setSaving(false);
    }
  }

  async function onDiscard() {
    if (saving) return;
    setSaving(true);
    try {
      await writeAudit('discarded');
      Alert.alert('Discarded', 'Submission was marked as discarded.');
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not discard.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#d4ff00" size="large" />
        <Text style={styles.loadingText}>Loading submission…</Text>
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle" size={64} color="#FF6B6B" />
        <Text style={styles.errorText}>Submission not found.</Text>
        <TouchableOpacity
          style={styles.goBackButton}
          onPress={() => router.back()}
        >
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const locationLabel =
    record.locationCity ||
    record.location?.city ||
    record.city ||
    null;

  const volunteerConfidenceLabel = (() => {
    const raw = volunteerConfidenceLevel
      ? volunteerConfidenceLevel.toString().toLowerCase()
      : '';

    if (raw === 'high') return 'High';
    if (raw === 'medium') return 'Medium';
    if (raw === 'low') return 'Low';

    if (confidenceStr) return `${confidenceStr}%`;
    if (aiConfidencePct != null) return `${aiConfidencePct}%`;

    return 'No confidence value provided by volunteer';
  })();

  const isCompleted =
    record.status === 'approved' || record.status === 'discarded';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.innerContainer}>
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
            <Text style={styles.headerTitle}>Review</Text>
            <View style={styles.titleUnderline} />
          </View>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={styles.menuButton}
          >
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* AI summary */}
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Ionicons name="sparkles" size={20} color="#d4ff00" />
              <Text style={styles.aiHeaderText}>AI Suggestion</Text>
            </View>
            <View style={styles.aiContent}>
              <View style={styles.aiRow}>
                <Text style={styles.aiLabel}>Species</Text>
                <Text style={styles.aiValue}>{aiSpecies || '—'}</Text>
              </View>
              <View style={styles.aiRow}>
                <Text style={styles.aiLabel}>Confidence</Text>
                <Text style={styles.aiValue}>
                  {aiConfidencePct != null ? `${aiConfidencePct}%` : '—'}
                </Text>
              </View>
            </View>
            <Text style={styles.recordingId}>
              Volunteer: {volunteerName ?? 'Unknown volunteer'}
            </Text>
          </View>

          {/* Recording details + mini map */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recording Details</Text>
            <Text style={styles.detailText}>
              Date &amp; Time: {recordedAtStr ?? 'Unknown'}
            </Text>
            {locationLabel && (
              <Text style={styles.detailText}>Location: {locationLabel}</Text>
            )}
            {mapRegion && (
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  region={mapRegion}
                  pointerEvents="none"
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Marker
                    coordinate={{
                      latitude: mapRegion.latitude,
                      longitude: mapRegion.longitude,
                    }}
                  />
                </MapView>

                {/* Zoom Controls */}
                <View style={styles.zoomControls}>
                  <TouchableOpacity
                    style={styles.zoomButton}
                    onPress={zoomIn}
                  >
                    <Text style={styles.zoomButtonText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.zoomButton}
                    onPress={zoomOut}
                  >
                    <Text style={styles.zoomButtonText}>−</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Audio player */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Audio Recording</Text>
            {audioUrl ? (
              <View style={styles.audioPlayer}>
                <View style={styles.waveformContainer}>
                  {[...Array(25)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: Math.random() * 40 + 10,
                          opacity: playing ? 1 : 0.5,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Pressable
                  onPress={loadAndPlay}
                  style={[
                    styles.playButton,
                    playing && styles.playButtonActive,
                  ]}
                  disabled={saving}
                >
                  <Ionicons
                    name={playing ? 'pause' : 'play'}
                    size={24}
                    color={playing ? '#2d3e34' : '#fff'}
                  />
                  <Text
                    style={[
                      styles.playButtonText,
                      playing && styles.playButtonTextActive,
                    ]}
                  >
                    {playing ? 'Pause' : 'Play'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.noAudioText}>
                No audio URL available.
              </Text>
            )}
          </View>

          {/* Species (Volunteer, read-only) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Species Confirmation by Volunteer
            </Text>
            <View style={[styles.selectInput, styles.readOnlyField]}>
              <Text
                style={[
                  styles.selectInputText,
                  !species && { color: '#888' },
                ]}
                numberOfLines={2}
              >
                {species || 'No species provided by volunteer'}
              </Text>
            </View>
          </View>

          {/* Volunteer Identification Confidence (read-only, High/Medium/Low) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Volunteer Confidence
            </Text>
            <View style={[styles.selectInput, styles.readOnlyField]}>
              <Text style={styles.selectInputText}>
                {volunteerConfidenceLabel}
              </Text>
            </View>
          </View>

          {/* Volunteer Notes (read-only) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Volunteer Notes</Text>
            <TextInput
              value={notes}
              editable={false}
              selectTextOnFocus={false}
              placeholder="No notes provided by volunteer"
              placeholderTextColor="#fff"
              multiline
              numberOfLines={4}
              style={[
                styles.textInput,
                styles.textArea,
                styles.readOnlyFieldInput,
              ]}
            />
          </View>

          {/* Action buttons (hidden once completed) */}
          {!isCompleted && (
            <View style={styles.actionButtons}>
              <Pressable
                onPress={onSave}
                disabled={saving}
                style={[
                  styles.approveButton,
                  saving && styles.buttonDisabled,
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color="#2d3e34"
                />
                <Text style={styles.approveButtonText}>Approve</Text>
              </Pressable>

              <Pressable
                onPress={onDiscard}
                disabled={saving}
                style={[
                  styles.discardButton,
                  saving && styles.buttonDisabled,
                ]}
              >
                <Ionicons
                  name="close-circle"
                  size={24}
                  color="#FF6B6B"
                />
                <Text style={styles.discardButtonText}>Discard</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3F5A47',
  },
  innerContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#3F5A47',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#aaa',
  },
  errorText: {
    fontSize: 18,
    color: '#fff',
  },
  goBackButton: {
    backgroundColor: '#d4ff00',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  goBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3e34',
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  aiCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#d4ff00',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#d4ff00',
  },
  aiContent: {
    gap: 8,
  },
  aiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aiLabel: {
    fontSize: 14,
    color: '#aaa',
  },
  aiValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  recordingId: {
    fontSize: 14,
    color: '#fff',
    marginTop: 12,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d4ff00',
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 4,
  },
  mapContainer: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
    height: 160,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  zoomControls: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'column',
    gap: 6,
  },
  zoomButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,255,0,0.8)',
  },
  zoomButtonText: {
    color: '#d4ff00',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  audioPlayer: {
    gap: 12,
  },
  waveformContainer: {
    height: 60,
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 12,
  },
  waveformBar: {
    width: 4,
    backgroundColor: '#d4ff00',
    borderRadius: 2,
  },
  playButton: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#d4ff00',
  },
  playButtonActive: {
    backgroundColor: '#d4ff00',
  },
  playButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  playButtonTextActive: {
    color: '#2d3e34',
  },
  noAudioText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 20,
  },
  selectInput: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  selectInputText: {
    fontSize: 16,
    color: '#fff',
  },
  readOnlyField: {
    opacity: 0.9,
  },
  readOnlyFieldInput: {
    backgroundColor: '#3d4f44',
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  speciesOptions: {
    marginTop: 8,
    gap: 4,
  },
  speciesOption: {
    backgroundColor: '#3d4f44',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  speciesOptionActive: {
    backgroundColor: '#d4ff00',
  },
  speciesOptionText: {
    fontSize: 14,
    color: '#fff',
  },
  speciesOptionTextActive: {
    color: '#2d3e34',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#d4ff00',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3e34',
  },
  discardButton: {
    flex: 1,
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  discardButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
