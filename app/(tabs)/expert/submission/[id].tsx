// app/(tabs)/expert/submission/[id].tsx
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

// 🔥 Firestore
import {
    addDoc,
    arrayUnion,
    collection,
    doc,
    getDoc,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../../../firebaseConfig';

const SPECIES = [
  'American Bullfrog',
  'Northern Spring Peeper',
  'Eastern Gray Treefrog',
  'Green Frog',
  'Wood Frog',
  'Northern Leopard Frog',
  'American Toad',
  'Midland Chorus Frog',
];

type RecordingDoc = {
  id: string;
  ai?: { species?: string; confidence?: number };
  userId?: string;
  audioUrl?: string;
  audioURL?: string;
  filePath?: string;
  status?: string;
  [k: string]: any;
};

export default function SubmissionDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [rec, setRec] = useState<RecordingDoc | null>(null);
  const [species, setSpecies] = useState<string>('');
  const [conf, setConf] = useState<number>(0.8); // 0..1
  const [confPct, setConfPct] = useState<number>(80); // 0..100
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const mounted = useRef(true);

  const quickLevels = useMemo(
    () => [
      { label: 'Low', v: 0.4 },
      { label: 'Med', v: 0.7 },
      { label: 'High', v: 0.9 },
    ],
    []
  );

  useEffect(() => {
    mounted.current = true;
    (async () => {
      if (!id) return;
      const snap = await getDoc(doc(db, 'recordings', id));
      const data = snap.data() as any;
      if (!mounted.current) return;
      const defaultSpecies = data?.ai?.species || '';
      setRec({ id: snap.id, ...data });
      setSpecies(defaultSpecies);
      if (typeof data?.ai?.confidence === 'number') {
        const v = Math.max(0, Math.min(1, data.ai.confidence));
        setConf(v);
        setConfPct(Math.round(v * 100));
      }
    })();
    return () => {
      mounted.current = false;
      sound?.unloadAsync?.();
    };
  }, [id]);

  useEffect(() => {
    setConfPct(Math.round((conf ?? 0.8) * 100));
  }, [conf]);

  const audioSourceUri = rec?.audioUrl || rec?.audioURL || '';

  const play = async () => {
    if (!audioSourceUri) {
      Alert.alert('No audio', 'This submission has no playable audio URL.');
      return;
    }
    try {
      if (sound) {
        await sound.replayAsync();
        return;
      }
      const { sound: snd } = await Audio.Sound.createAsync(
        { uri: audioSourceUri },
        { shouldPlay: true }
      );
      setSound(snd);
    } catch (e) {
      console.warn('Audio play failed:', e);
      Alert.alert('Playback error', 'Could not play the audio file.');
    }
  };

  async function getExpertIdentity(uid: string) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data() || {};
      const displayName = auth.currentUser?.displayName || '';
      const [fn = '', ln = ''] =
        data.firstName && data.lastName
          ? [data.firstName, data.lastName]
          : displayName.split(' ');
      return { firstName: fn, lastName: ln };
    } catch {
      return { firstName: '', lastName: '' };
    }
  }

  async function writeAudit(finalStatus: 'approved' | 'discarded') {
    if (!id || !rec) return;

    const reviewerId = auth.currentUser?.uid;
    if (!reviewerId) {
      Alert.alert('Not signed in', 'You must be signed in as an expert.');
      return;
    }

    const { firstName, lastName } = await getExpertIdentity(reviewerId);

    // Normalize confidence & explicit decision label for logs/rollups
    const safeConf = Math.max(0, Math.min(1, conf));
    const decision = finalStatus === 'approved' ? 'approved' : 'rejected'; // keep 'discarded' in status if you prefer

    // --- 1) Update the recording document
    const patch: any = {
      expertReview: {
        species,
        confidence: safeConf,
        reviewer: { uid: reviewerId, firstName, lastName },
        reviewedAt: serverTimestamp(),
      },
      status: finalStatus,
      lastUpdated: serverTimestamp(),
      history: arrayUnion({
        action: 'expert_review',
        actorId: reviewerId,
        decision, // explicit decision for history queries
        species,
        confidence: safeConf,
        timestamp: new Date().toISOString(), // client ISO for debugging
        serverTime: serverTimestamp(), // authoritative time for ordering
      }),
    };

    if (finalStatus === 'approved') {
      // Convenience top-level fields for public consumption / volunteer UI
      patch.species = species;
      patch.confidenceScore = safeConf;
    }

    await updateDoc(doc(db, 'recordings', id), patch);

    // --- 2) Append to reviews subcollection
    await addDoc(collection(db, 'recordings', id, 'reviews'), {
      species,
      confidence: safeConf,
      reviewer: { uid: reviewerId, firstName, lastName },
      reviewedAt: serverTimestamp(),
      status: finalStatus,
      decision, // mirror for quick admin reads
    });

    // --- 3) Approvals rollup (admin-friendly)
    await addDoc(collection(db, 'approvals'), {
      recordingId: id,
      volunteerId: rec.userId ?? null,
      expert: { uid: reviewerId, firstName, lastName },
      finalSpecies: species,
      confidence: safeConf,
      status: finalStatus, // keep if you query by status
      decision,           // and also decision for clarity
      createdAt: serverTimestamp(), // stable sort key
      reviewedAt: serverTimestamp(),
    });

    // --- 4) Admin logs
    await addDoc(collection(db, 'admin_logs'), {
      action: 'expertReview',
      actorId: reviewerId,
      details: {
        recordingId: id,
        volunteerId: rec.userId ?? null,
        finalSpecies: species,
        confidence: safeConf,
        decision,
        note:
          finalStatus === 'approved'
            ? 'Expert verified submission'
            : 'Expert discarded submission',
      },
      success: true,
      timestamp: serverTimestamp(),
    });
  }

  const onSave = async () => {
    if (!species) {
      Alert.alert('Missing species', 'Please select the final species.');
      return;
    }
    try {
      await writeAudit('approved');
      router.back();
    } catch (e: any) {
      console.error('Save review failed', e);
      Alert.alert('Error', e?.message || 'Could not save review.');
    }
  };

  const onDiscard = async () => {
    try {
      await writeAudit('discarded');
      router.back();
    } catch (e: any) {
      console.error('Discard failed', e);
      Alert.alert('Error', e?.message || 'Could not discard.');
    }
  };

  if (!rec)
    return (
      <View style={{ padding: 16 }}>
        <Text>Loading…</Text>
      </View>
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>
        Submission {rec.id}
      </Text>

      <View style={{ gap: 4 }}>
        <Text>AI Species: {rec.ai?.species ?? '—'}</Text>
        <Text>
          AI Confidence:{' '}
          {typeof rec.ai?.confidence === 'number'
            ? Math.round(rec.ai.confidence * 100) + '%'
            : '—'}
        </Text>
      </View>

      <Pressable
        onPress={play}
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          alignSelf: 'flex-start',
        }}
      >
        <Text>Play Audio</Text>
      </Pressable>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: '600' }}>Final Species (Expert)</Text>
        <Picker selectedValue={species} onValueChange={setSpecies}>
          {SPECIES.map((s) => (
            <Picker.Item label={s} value={s} key={s} />
          ))}
        </Picker>
      </View>

      {/* Confidence (chips + numeric input) */}
      <Text style={{ fontWeight: '600' }}>Expert Confidence: {confPct}%</Text>

      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
        {quickLevels.map((l) => (
          <Pressable
            key={l.label}
            onPress={() => {
              setConf(l.v);
              setConfPct(Math.round(l.v * 100));
            }}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 12,
              borderWidth: 1,
            }}
          >
            <Text>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={{ borderWidth: 1, borderRadius: 8, padding: 10, width: 110 }}
          keyboardType="number-pad"
          value={String(confPct)}
          onChangeText={(t) => {
            const n = Math.max(0, Math.min(100, parseInt(t || '0', 10)));
            setConfPct(n);
            setConf(n / 100);
          }}
          placeholder="0–100"
        />
        <Text>Set exact %</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
        <Pressable
          onPress={onSave}
          style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}
        >
          <Text>Save Review</Text>
        </Pressable>
        <Pressable
          onPress={onDiscard}
          style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}
        >
          <Text>Discard</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
