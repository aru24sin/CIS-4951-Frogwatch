// app/(tabs)/historyScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, DocumentData,
  onSnapshot, query, Timestamp, updateDoc, where
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import NavigationMenu from '../../components/NavigationMenu';
import app, { auth, db } from '../firebaseConfig';

type Recording = {
  recordingId: string;
  userId: string;
  predictedSpecies: string;
  species: string;
  audioURL?: string;
  location: { latitude: number; longitude: number };
  locationCity?: string;
  status: string;
  timestampISO?: string;
  confidence?: number;
  notes?: string;
  submitterName?: string;
  recordingNumber?: number;
};

const speciesImageMap: Record<string, any> = {
  'Bullfrog': require('../../assets/frogs/bullfrog.png'),
  'Green Frog': require('../../assets/frogs/treefrog.png'),
  'Northern Spring Peeper': require('../../assets/frogs/spring_peeper.png'),
  'Northern Leopard Frog': require('../../assets/frogs/northern_leopard.png'),
  'Eastern Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
  'Wood Frog': require('../../assets/frogs/wood_frog.png'),
  'American Toad': require('../../assets/frogs/american_toad.png'),
  'Midland Chorus Frog': require('../../assets/frogs/midland_chorus.png')
};
const placeholderImage = require('../../assets/frogs/placeholder.png');

// All available species options
const speciesOptions = [
  'Bullfrog',
  'Green Frog',
  'Northern Spring Peeper',
  'Northern Leopard Frog',
  'Eastern Gray Treefrog',
  'Wood Frog',
  'American Toad',
  'Midland Chorus Frog'
];

function pickDevHost() {
  const url: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const m = url?.match(/\/\/([^/:]+):\d+/);
  return m?.[1] ?? 'localhost';
}
//const API_BASE = __DEV__ ? `http://${pickDevHost()}:8000` : 'https://your-production-domain';
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (__DEV__ ? `http://${pickDevHost()}:8000` : 'https://frogwatch-backend-1066546787031.us-central1.run.app');


function resolveAudioURL(d: any): string | undefined {
  const filePath = d?.filePath || (d?.fileName ? `uploaded_audios/${d.fileName}` : undefined);
  if (filePath) {
    const bucket = (app.options as any).storageBucket as string;
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
  }
  const a = d?.audioURL;
  if (typeof a === 'string') {
    if (/^https?:\/\//i.test(a)) return a;
    if (a.startsWith('/get-audio/')) return `${API_BASE}${a}`;
  }
  return undefined;
}

async function getCityFromCoords(lat: number, lon: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );
    const data = await response.json();
    const city = data.address?.city || data.address?.town || data.address?.village || 'Unknown';
    const state = data.address?.state || '';
    return state ? `${city}, ${state}` : city;
  } catch (error) {
    return 'Unknown Location';
  }
}

export default function HistoryScreen() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editSpecies, setEditSpecies] = useState('');
  const [editConfidence, setEditConfidence] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let offAuth: (() => void) | undefined;
    let offSnap: (() => void) | undefined;

    offAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setRecordings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorText(null);

      const q = query(collection(db, 'recordings'), where('userId', '==', user.uid));

      offSnap = onSnapshot(
        q,
        async (snap) => {
          const rows: Recording[] = [];
          let index = 1;
          
          for (const doc of snap.docs) {
            const d = doc.data() as DocumentData;
            const ts: Timestamp | undefined = d.timestamp;
            const timestampISO = ts?.toDate?.()?.toLocaleDateString?.() ?? d.timestamp_iso ?? 'Unknown';

            const lat = Number(d?.location?.lat) || 0;
            const lon = Number(d?.location?.lng) || 0;
            const locationCity = lat && lon ? await getCityFromCoords(lat, lon) : 'Unknown Location';

            const submitterName = d.submitter?.displayName || 
                                  `${d.submitter?.firstName || ''} ${d.submitter?.lastName || ''}`.trim() ||
                                  'Unknown';

            rows.push({
              recordingId: d.recordingId ?? doc.id,
              userId: d.userId ?? '',
              predictedSpecies: d.predictedSpecies ?? '',
              species: d.species ?? '',
              audioURL: resolveAudioURL(d),
              location: { latitude: lat, longitude: lon },
              locationCity,
              status: d.status ?? 'pending_analysis',
              timestampISO,
              confidence:
                typeof d.confidenceScore === 'number'
                  ? Math.round(d.confidenceScore * 100)
                  : undefined,
              notes: d.notes || '',
              submitterName,
              recordingNumber: index++,
            });
          }

          setRecordings(rows);
          setLoading(false);
        },
        (err) => {
          setErrorText(err?.message || String(err));
          setRecordings([]);
          setLoading(false);
        }
      );
    });

    return () => {
      offSnap?.();
      offAuth?.();
      sound?.unloadAsync().catch(() => {});
    };
  }, [sound]);

  const handlePlay = async (uri?: string) => {
    if (!uri) return;
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (e) {
      console.error('Audio play error:', e);
    }
  };

  const handleExpand = (rec: Recording) => {
    if (expandedId === rec.recordingId) {
      setExpandedId(null);
      setEditMode(null);
    } else {
      setExpandedId(rec.recordingId);
      setEditMode(null);
      setEditSpecies(rec.predictedSpecies);
      setEditConfidence(String(rec.confidence ?? ''));
      setEditNotes(rec.notes ?? '');
    }
  };

  const handleEdit = (rec: Recording) => {
    if (editMode === rec.recordingId) {
      setEditMode(null);
    } else {
      setEditMode(rec.recordingId);
      setEditSpecies(rec.species || rec.predictedSpecies);
      setEditConfidence(String(rec.confidence ?? ''));
      setEditNotes(rec.notes ?? '');
    }
  };

  const handleResubmit = async (recordingId: string) => {
    // Validate confidence score
    const confidenceNum = parseInt(editConfidence, 10);
    if (editConfidence && (isNaN(confidenceNum) || confidenceNum < 0 || confidenceNum > 100)) {
      Alert.alert('Invalid Confidence', 'Please enter a number between 0 and 100');
      return;
    }

    setIsSaving(true);
    try {
      const recordingRef = doc(db, 'recordings', recordingId);
      
      const updates: any = {
        species: editSpecies,
        predictedSpecies: editSpecies,
        notes: editNotes,
        status: 'needs_review', // Reset status for re-review
      };

      // Only update confidence if a valid number was entered
      if (editConfidence && !isNaN(confidenceNum)) {
        updates.confidenceScore = confidenceNum / 100; // Store as decimal
      }

      await updateDoc(recordingRef, updates);

      // Update local state
      setRecordings(prevRecordings =>
        prevRecordings.map(rec =>
          rec.recordingId === recordingId
            ? {
                ...rec,
                species: editSpecies,
                predictedSpecies: editSpecies,
                notes: editNotes,
                confidence: confidenceNum || rec.confidence,
                status: 'needs_review',
              }
            : rec
        )
      );

      setEditMode(null);
      Alert.alert('Success', 'Recording updated and resubmitted for review');
    } catch (error) {
      console.error('Error updating recording:', error);
      Alert.alert('Error', 'Failed to update recording. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRecordings = useMemo(() => {
    if (!searchQuery.trim()) return recordings;
    const lower = searchQuery.toLowerCase();
    return recordings.filter(
      (r) =>
        r.predictedSpecies.toLowerCase().includes(lower) ||
        r.locationCity?.toLowerCase().includes(lower)
    );
  }, [recordings, searchQuery]);

  const renderItem = ({ item }: { item: Recording }) => {
    const img = speciesImageMap[item.predictedSpecies] || placeholderImage;
    const isExpanded = expandedId === item.recordingId;
    const isEditing = editMode === item.recordingId;
    const isApproved = item.status === 'approved';

    return (
      <View style={styles.itemContainer}>
        <TouchableOpacity onPress={() => handleExpand(item)}>
          <View style={styles.card}>
            <View style={styles.cardLeft}>
              <View style={styles.speciesTag}>
                <Text style={styles.speciesTagText}>Frog Spec #{item.recordingNumber}</Text>
              </View>
              <View style={styles.statusIcon}>
                {isApproved ? (
                  <Ionicons name="checkmark-circle" size={24} color="#6ee96e" />
                ) : (
                  <Ionicons name="cloud-upload" size={24} color="#4db8e8" />
                )}
              </View>
              <Text style={styles.locationText}>{item.locationCity}</Text>
            </View>
            <Image source={img} style={styles.cardImage} />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedCard}>
            <View style={styles.expandedHeader}>
              <Text style={styles.expandedDate}>{item.timestampISO}</Text>
              <TouchableOpacity onPress={() => handleEdit(item)}>
                <Text style={styles.editText}>{isEditing ? 'cancel' : 'edit'}</Text>
              </TouchableOpacity>
            </View>

            {isEditing ? (
              <View style={styles.editContainer}>
                {/* Species Dropdown */}
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={editSpecies}
                    onValueChange={(value) => setEditSpecies(value)}
                    style={styles.picker}
                    dropdownIconColor="#d4ff00"
                  >
                    {speciesOptions.map((species) => (
                      <Picker.Item
                        key={species}
                        label={species}
                        value={species}
                        color="#000"
                      />
                    ))}
                  </Picker>
                </View>
                <TextInput
                  style={styles.editInput}
                  value={editConfidence}
                  onChangeText={setEditConfidence}
                  placeholder="Confidence Score (0-100)"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <TextInput
                  style={[styles.editInput, styles.notesInput]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Add notes..."
                  placeholderTextColor="#999"
                  multiline
                />
              </View>
            ) : (
              <>
                {/* Species Display */}
                <View style={styles.speciesDisplayBox}>
                  <Text style={styles.speciesDisplayText}>
                    {item.species || item.predictedSpecies || 'Unknown Species'}
                  </Text>
                </View>
                <View style={styles.scoreContainer}>
                  <View style={styles.scoreBox}>
                    <Text style={styles.scoreLabel}>score</Text>
                    <Text style={styles.scoreValue}>{item.confidence ?? 'N/A'}</Text>
                  </View>
                  <View style={styles.notesBox}>
                    <Text style={styles.notesText}>
                      {item.notes || 'No notes added'}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Waveform placeholder */}
            <View style={styles.waveformPlaceholder} />

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.playButton}
                onPress={() => handlePlay(item.audioURL)}
              >
                <Text style={styles.playButtonText}>play</Text>
              </TouchableOpacity>
              {isEditing ? (
                <TouchableOpacity
                  style={[styles.resubmitButton, isSaving && styles.buttonDisabled]}
                  onPress={() => handleResubmit(item.recordingId)}
                  disabled={isSaving}
                >
                  <Text style={styles.resubmitButtonText}>
                    {isSaving ? 'saving...' : 'save & resubmit'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.resubmitButton}
                  onPress={() => handleEdit(item)}
                >
                  <Text style={styles.resubmitButtonText}>edit to resubmit</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.uploaderInfo}>
              <Text style={styles.uploaderName}>{item.submitterName}</Text>
              <Text style={styles.uploadStatus}>
                {item.status === 'approved' ? 'Approved' : 
                 item.status === 'needs_review' ? 'Pending Review' : 
                 item.status}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#b8e986" style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>History</Text>
          <View style={styles.titleUnderline} />
        </View>
        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
          <Ionicons name="menu" size={32} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={24} color="#fff" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
          placeholderTextColor="#aaa"
        />
      </View>

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      {/* List */}
      <FlatList
        data={filteredRecordings}
        keyExtractor={(item) => item.recordingId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No recordings yet. Make one from the Record screen!
          </Text>
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
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 48,
    fontWeight: '400',
    color: '#fff',
  },
  titleUnderline: {
    width: 160,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d4ff00',
    marginTop: 4,
  },
  menuButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderWidth: 2,
    borderColor: '#d4ff00',
    borderRadius: 25,
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 20,
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  error: {
    padding: 12,
    color: '#ffdddd',
    textAlign: 'center',
  },
  emptyText: {
    padding: 16,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
  },
  itemContainer: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#3d4f44',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  speciesTag: {
    backgroundColor: '#d4ff00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  speciesTagText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2d3e34',
  },
  statusIcon: {
    marginBottom: 8,
  },
  locationText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
  },
  cardImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  expandedCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  expandedDate: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
  },
  editText: {
    fontSize: 16,
    color: '#d4ff00',
  },
  dropdownPlaceholder: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  dropdownText: {
    fontSize: 16,
    color: '#fff',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    color: '#333',
  },
  speciesDisplayBox: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#d4ff00',
  },
  speciesDisplayText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#d4ff00',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scoreContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  scoreBox: {
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3e34',
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2d3e34',
  },
  notesBox: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderWidth: 2,
    borderColor: '#d4ff00',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
  },
  notesText: {
    fontSize: 14,
    color: '#fff',
  },
  editContainer: {
    marginBottom: 12,
  },
  editInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  waveformPlaceholder: {
    height: 60,
    backgroundColor: '#1a252a',
    borderRadius: 12,
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  playButton: {
    flex: 1,
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  resubmitButton: {
    flex: 1,
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  resubmitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  uploaderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  uploaderName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  uploadStatus: {
    fontSize: 14,
    color: '#aaa',
  },
});