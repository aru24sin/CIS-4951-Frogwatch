// app/(tabs)/expert/submission/[id].tsx
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
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { auth, db, storage } from '../../../firebaseConfig';

type RecordingDoc = {
  userId: string;
  status: 'needs_review' | 'approved' | 'discarded';
  timestamp?: any;
  // Audio path can be a direct URL or a Storage path like 'recordings/abc.m4a'
  audioUrl?: string;
  audioPath?: string;
  // AI helper fields (your schema may use ai.species or predictedSpecies)
  ai?: { species?: string; confidence?: number };
  predictedSpecies?: string;
  // Optional existing expert fields:
  expertSpecies?: string;
  expertConfidence?: number;
  notes?: string;
};

export default function ExpertSubmissionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [record, setRecord] = useState<RecordingDoc | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [species, setSpecies] = useState('');
  const [confidenceStr, setConfidenceStr] = useState(''); // 0–100 as string for simple input
  const [notes, setNotes] = useState('');

  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  const aiSpecies = useMemo(
    () => record?.ai?.species || record?.predictedSpecies || '',
    [record]
  );
  const aiConfidencePct = useMemo(() => {
    const c = record?.ai?.confidence;
    if (typeof c === 'number' && !Number.isNaN(c)) {
      // Assuming c is 0..1
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

  // Common review writer
  async function writeAudit(action: 'approved' | 'discarded') {
    if (!id) throw new Error('Missing id');
    const user = auth.currentUser;
    const reviewerId = user?.uid || 'unknown';

    const confPct = confidenceStr.trim() === '' ? null : Number(confidenceStr);
    const conf01 =
      confPct == null || Number.isNaN(confPct)
        ? null
        : Math.max(0, Math.min(100, confPct)) / 100;

    // 1) Add a review event under subcollection
    await addDoc(collection(db, 'recordings', id, 'reviews'), {
      action,
      species: species?.trim() || null,
      confidence: conf01,
      reviewerId,
      notes: notes?.trim() || null,
      createdAt: serverTimestamp(),
    });

    // 2) Update the parent doc
    const updates: any = {
      status: action,
      reviewedAt: serverTimestamp(),
      reviewedBy: reviewerId,
      // Keep the latest expert choice on parent doc for quick querying
      expertSpecies: species?.trim() || null,
      expertConfidence: conf01,
      expertNotes: notes?.trim() || null,
    };
    // If discarded, you might want to null out expertSpecies/confidence—here we keep values if provided.
    await updateDoc(doc(db, 'recordings', id), updates);
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, opacity: 0.7 }}>Loading submission…</Text>
      </View>
    );
  }

  if (!record) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Submission not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Review Submission</Text>

      {/* AI summary */}
      <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontWeight: '600' }}>AI suggestion</Text>
        <Text style={{ marginTop: 4 }}>
          Species: <Text style={{ fontWeight: '600' }}>{aiSpecies || '—'}</Text>
        </Text>
        <Text>
          Confidence: <Text style={{ fontWeight: '600' }}>
            {aiConfidencePct != null ? `${aiConfidencePct}%` : '—'}
          </Text>
        </Text>
        <Text style={{ opacity: 0.7, marginTop: 4 }}>ID: {id}</Text>
      </View>

      {/* Audio controls */}
      <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Audio</Text>
        {audioUrl ? (
          <Pressable
            onPress={loadAndPlay}
            style={{
              padding: 12,
              borderWidth: 1,
              borderRadius: 10,
              alignSelf: 'flex-start',
              opacity: saving ? 0.5 : 1,
            }}
            disabled={saving}
          >
            <Text>{playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
        ) : (
          <Text style={{ opacity: 0.7 }}>No audio URL available.</Text>
        )}
      </View>

      {/* Species input */}
      <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontWeight: '600' }}>Species (required to approve)</Text>
        <TextInput
          value={species}
          onChangeText={setSpecies}
          placeholder={aiSpecies ? `e.g., ${aiSpecies}` : 'Enter species'}
          autoCapitalize="words"
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
          }}
          editable={!saving}
        />
      </View>

      {/* Confidence input */}
      <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <Text style={{ fontWeight: '600' }}>Your confidence (0–100)</Text>
        <TextInput
          value={confidenceStr}
          onChangeText={(txt) => {
            // keep only digits
            const digits = txt.replace(/[^\d]/g, '');
            setConfidenceStr(digits);
          }}
          placeholder={aiConfidencePct != null ? String(aiConfidencePct) : 'e.g., 75'}
          keyboardType="numeric"
          maxLength={3}
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
            width: 120,
          }}
          editable={!saving}
        />
        <Text style={{ opacity: 0.6, marginTop: 6 }}>
          (We'll store this as 0–1 under <Text style={{ fontWeight: '600' }}>expertConfidence</Text>.)
        </Text>
      </View>

      {/* Notes */}
      <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <Text style={{ fontWeight: '600' }}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any remarks about background noise, overlapping calls, etc."
          multiline
          numberOfLines={3}
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
            minHeight: 80,
            textAlignVertical: 'top',
          }}
          editable={!saving}
        />
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={{
            opacity: saving ? 0.5 : 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontWeight: '600' }}>Save Review</Text>
        </Pressable>

        <Pressable
          onPress={onDiscard}
          disabled={saving}
          style={{
            opacity: saving ? 0.5 : 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontWeight: '600' }}>Discard</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
