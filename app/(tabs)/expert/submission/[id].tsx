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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NavigationMenu from '../../../../components/NavigationMenu';
import { auth, db, storage } from '../../../firebaseConfig';

type RecordingDoc = {
  userId: string;
  status: 'needs_review' | 'approved' | 'discarded';
  timestamp?: any;
  audioUrl?: string;
  audioPath?: string;
  ai?: { species?: string; confidence?: number };
  predictedSpecies?: string;
  expertSpecies?: string;
  expertConfidence?: number;
  notes?: string;
};

// Species options for the picker
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

export default function ExpertSubmissionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const [record, setRecord] = useState<RecordingDoc | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [species, setSpecies] = useState('');
  const [confidenceStr, setConfidenceStr] = useState('');
  const [notes, setNotes] = useState('');
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  const aiSpecies = useMemo(
    () => record?.ai?.species || record?.predictedSpecies || '',
    [record]
  );
  const aiConfidencePct = useMemo(() => {
    const c = record?.ai?.confidence;
    if (typeof c === 'number' && !Number.isNaN(c)) {
      return Math.round(Math.max(0, Math.min(1, c)) * 100);
    }
    return null;
  }, [record]);

  // Load document + audio URL
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!id) {
          Alert.alert('Missing ID', 'No submission id provided.');
          return;
        }
        const snap = await getDoc(doc(db, 'recordings', id));
        if (!snap.exists()) {
          Alert.alert('Not found', 'Submission does not exist.');
          return;
        }
        const data = snap.data() as RecordingDoc;
        if (!alive) return;
        setRecord(data);

        // Pre-fill editable fields with either past expert choices or AI suggestion
        setSpecies((data.expertSpecies || data.ai?.species || data.predictedSpecies || '').trim());
        const confInit =
          data.expertConfidence != null
            ? Math.round(Number(data.expertConfidence) * 100)
            : aiConfidencePct ?? '';
        setConfidenceStr(confInit === '' ? '' : String(confInit));
        setNotes(data.notes || '');

        // Resolve audio URL
        let url: string | null = null;
        if (data.audioUrl && data.audioUrl.startsWith('http')) {
          url = data.audioUrl;
        } else if (data.audioPath) {
          url = await getDownloadURL(storageRef(storage, data.audioPath));
        }
        if (!alive) return;
        setAudioUrl(url || null);
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

    // Toggle: if currently playing, pause
    if (soundRef.current && playing) {
      try {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    // If we already have a sound loaded but not playing, just play
    if (soundRef.current && !playing) {
      try {
        await soundRef.current.playAsync();
        setPlaying(true);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    // Fresh load
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

  // Common review writer - updates Firestore directly
  async function writeAudit(action: 'approved' | 'discarded') {
    if (!id) {
      throw new Error('Missing recording id');
    }
    
    const user = auth.currentUser;
    if (!user) {
      throw new Error('You must be logged in to review submissions.');
    }
    
    const reviewerId = user.uid;
    const confPct = confidenceStr.trim() === '' ? null : Number(confidenceStr);
    const conf01 = confPct == null || Number.isNaN(confPct)
      ? null
      : Math.max(0, Math.min(100, confPct)) / 100;

    console.log(`Attempting to ${action} recording ${id}...`);

    // Update Firestore directly
    try {
      // 1. Add a review event under subcollection for audit trail
      await addDoc(collection(db, 'recordings', id, 'reviews'), {
        action,
        species: species?.trim() || null,
        confidence: conf01,
        reviewerId,
        notes: notes?.trim() || null,
        createdAt: serverTimestamp(),
      });
      console.log('Review audit log created');

      // 2. Update the parent recording document
      const updates: Record<string, any> = {
        status: action, // 'approved' or 'discarded'
        reviewedAt: serverTimestamp(),
        reviewedBy: reviewerId,
      };
      
      if (species?.trim()) {
        updates.expertSpecies = species.trim();
      }
      if (conf01 !== null) {
        updates.expertConfidence = conf01;
      }
      if (notes?.trim()) {
        updates.expertNotes = notes.trim();
      }
      
      await updateDoc(doc(db, 'recordings', id), updates);
      console.log(`Recording ${id} status updated to '${action}'`);
      
    } catch (error: any) {
      console.error('Firestore update failed:', error);
      throw new Error(error?.message || 'Failed to update recording in database');
    }
  }

  async function onSave() {
    if (saving) return;
    if (!species?.trim()) {
      Alert.alert('Missing species', 'Please select or type a species before approving.');
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
        <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.innerContainer}>
        <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Review</Text>
            <View style={styles.titleUnderline} />
          </View>
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
            <Ionicons name="menu" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* AI Summary Card */}
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
          <Text style={styles.recordingId}>ID: {id}</Text>
        </View>

        {/* Audio Player */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Audio Recording</Text>
          {audioUrl ? (
            <View style={styles.audioPlayer}>
              {/* Waveform Visualization */}
              <View style={styles.waveformContainer}>
                {[...Array(25)].map((_, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.waveformBar, 
                      { height: Math.random() * 40 + 10, opacity: playing ? 1 : 0.5 }
                    ]} 
                  />
                ))}
              </View>
              <Pressable
                onPress={loadAndPlay}
                style={[styles.playButton, playing && styles.playButtonActive]}
                disabled={saving}
              >
                <Ionicons 
                  name={playing ? 'pause' : 'play'} 
                  size={24} 
                  color={playing ? '#2d3e34' : '#fff'} 
                />
                <Text style={[styles.playButtonText, playing && styles.playButtonTextActive]}>
                  {playing ? 'Pause' : 'Play'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.noAudioText}>No audio URL available.</Text>
          )}
        </View>

        {/* Species Selection */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Species (required)</Text>
          <TouchableOpacity 
            style={styles.selectInput}
            onPress={() => setShowSpeciesPicker(!showSpeciesPicker)}
          >
            <Text style={[styles.selectInputText, !species && { color: '#888' }]}>
              {species || 'Select species...'}
            </Text>
            <Ionicons 
              name={showSpeciesPicker ? 'chevron-up' : 'chevron-down'} 
              size={20} 
              color="#d4ff00" 
            />
          </TouchableOpacity>
          
          {showSpeciesPicker && (
            <View style={styles.speciesOptions}>
              {speciesOptions.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.speciesOption, species === opt && styles.speciesOptionActive]}
                  onPress={() => {
                    setSpecies(opt);
                    setShowSpeciesPicker(false);
                  }}
                >
                  <Text style={[styles.speciesOptionText, species === opt && styles.speciesOptionTextActive]}>
                    {opt}
                  </Text>
                  {species === opt && <Ionicons name="checkmark" size={20} color="#2d3e34" />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Confidence Input */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Confidence (0–100)</Text>
          <TextInput
            value={confidenceStr}
            onChangeText={(txt) => {
              const digits = txt.replace(/[^\d]/g, '');
              setConfidenceStr(digits);
            }}
            placeholder={aiConfidencePct != null ? String(aiConfidencePct) : 'e.g., 75'}
            placeholderTextColor="#888"
            keyboardType="numeric"
            maxLength={3}
            style={styles.textInput}
            editable={!saving}
          />
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any remarks about background noise, overlapping calls, etc."
            placeholderTextColor="#888"
            multiline
            numberOfLines={4}
            style={[styles.textInput, styles.textArea]}
            editable={!saving}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={[styles.approveButton, saving && styles.buttonDisabled]}
          >
            <Ionicons name="checkmark-circle" size={24} color="#2d3e34" />
            <Text style={styles.approveButtonText}>Approve</Text>
          </Pressable>

          <Pressable
            onPress={onDiscard}
            disabled={saving}
            style={[styles.discardButton, saving && styles.buttonDisabled]}
          >
            <Ionicons name="close-circle" size={24} color="#FF6B6B" />
            <Text style={styles.discardButtonText}>Discard</Text>
          </Pressable>
        </View>
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
    paddingBottom: 100,  // Increased padding for safe area and button accessibility
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
    fontSize: 12,
    color: '#666',
    marginTop: 12,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  selectInputText: {
    fontSize: 16,
    color: '#fff',
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
