import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Button, Text, TextInput, View } from 'react-native';
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
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} />;

  if (!submission) return <Text>No submission found</Text>;

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Species: {submission.predictedSpecies}</Text>
      <Text style={{ marginTop: 5 }}>Confidence: {Math.round((submission.confidenceScore ?? 0) * 100)}%</Text>
      <Text style={{ marginTop: 5 }}>Location: {submission.location?.display ?? 'Unknown'}</Text>

      <Text style={{ marginTop: 20 }}>Audio URL:</Text>
      <Text selectable style={{ color: 'blue' }}>{audioUrl}</Text>

      <Text style={{ marginTop: 20 }}>Notes:</Text>
      <TextInput
        style={{ borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 5 }}
        placeholder="Type your review notes..."
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <View style={{ marginTop: 20 }}>
        <Button title="Approve" onPress={() => mark('approved')} />
      </View>
      <View style={{ marginTop: 10 }}>
        <Button title="Reject" color="red" onPress={() => mark('rejected')} />
      </View>
    </View>
  );
}
