import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { db } from '../../../firebaseConfig';

export default function ExpertReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); // submission ID
  const router = useRouter();

  const [submission, setSubmission] = useState<any>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);

  // Load submission info + audio URL
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'submissions', id!));
        if (!snap.exists()) {
          Alert.alert('Error', 'Submission not found');
          router.back();
          return;
        }
        const data = snap.data();
        setSubmission(data);

        const url = await getDownloadURL(ref(getStorage(), data.storagePath));
        setAudioUrl(url);
      } catch (err: any) {
        Alert.alert('Error', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function mark(status: 'approved' | 'rejected') {
    try {
      setLoading(true);
      // add a short review record
      await addDoc(collection(db, 'submissions', id!, 'reviews'), {
        status,
        notes,
        createdAt: serverTimestamp(),
      });

      // update submission status
      await updateDoc(doc(db, 'submissions', id!), {
        status,
        reviewedAt: serverTimestamp(),
      });

      Alert.alert('Done', `Marked as ${status}`);
      router.replace('/(tabs)/expert/review-queue');
    } catch (err: any) {
      console.log('Expert mark() failed:', err);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#2d3e34', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#d4ff00" />
      </View>
    );
  }

  if (!submission) {
    return (
      <View style={{ flex: 1, backgroundColor: '#2d3e34', padding: 16, paddingTop: 64 }}>
        {/* Back */}
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/expert/review-queue')}
          style={{
            width: 44, height: 44, borderRadius: 22,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: 12,
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff' }}>No submission found</Text>
      </View>
    );
  }

  const confPct =
    typeof submission.confidenceScore === 'number'
      ? Math.round(Math.max(0, Math.min(1, submission.confidenceScore)) * 100)
      : '—';

  return (
    <View style={{ flex: 1, backgroundColor: '#2d3e34', padding: 16, paddingTop: 64 }}>
      {/* Back */}
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/expert/review-queue')}
        style={{
          width: 44, height: 44, borderRadius: 22,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: 12,
        }}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Header */}
      <Text style={{ fontSize: 24, fontWeight: '700', color: '#d4ff00', marginBottom: 12 }}>
        Review Submission
      </Text>

      {/* Details */}
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#fff' }}>
        Species: <Text style={{ color: '#d4ff00' }}>{submission.predictedSpecies}</Text>
      </Text>
      <Text style={{ marginTop: 6, color: '#fff' }}>
        Confidence: <Text style={{ color: '#d4ff00' }}>{confPct}%</Text>
      </Text>
      <Text style={{ marginTop: 6, color: '#fff' }}>
        Location: <Text style={{ color: '#d4ff00' }}>{submission.location?.display ?? 'Unknown'}</Text>
      </Text>

      <Text style={{ marginTop: 16, color: '#fff' }}>Audio URL:</Text>
      <Text selectable style={{ color: '#d4ff00' }}>{audioUrl}</Text>

      <Text style={{ marginTop: 16, color: '#fff' }}>Notes</Text>
      <TextInput
        style={{
          borderWidth: 2,
          borderColor: '#d4ff00',
          borderRadius: 12,
          padding: 12,
          marginTop: 6,
          backgroundColor: 'rgba(0,0,0,0.2)',
          color: '#fff',
        }}
        placeholder="Type your review notes..."
        placeholderTextColor="#cdd5cc"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {/* Actions */}
      <View style={{ marginTop: 20, flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity
          onPress={() => mark('approved')}
          style={{
            flex: 1,
            backgroundColor: '#d4ff00',
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>Approve</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => mark('rejected')}
          style={{
            flex: 1,
            backgroundColor: '#d4ff00',
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: '700', color: '#0a0a0a' }}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
