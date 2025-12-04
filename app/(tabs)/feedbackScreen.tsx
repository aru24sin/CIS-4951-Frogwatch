// app/(tabs)/feedbackScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NavigationMenu from '../../components/NavigationMenu';
import { auth, db } from '../firebaseConfig';
import { feedbackAPI } from '../../services/api';

type FeedbackItem = {
  id: string;
  message: string;
  rating?: number;
  response?: string;
  timestamp: string;
};

// Helper function to get the correct home screen based on user role
const getHomeScreen = async (): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) return './volunteerHomeScreen';
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data() || {};
    
    const roleStr = (userData.role || '').toString().toLowerCase();
    const isAdmin = userData.isAdmin === true || roleStr === 'admin';
    const isExpert = userData.isExpert === true || roleStr === 'expert';
    
    if (isAdmin) return './adminHomeScreen';
    if (isExpert) return './expertHomeScreen';
    return './volunteerHomeScreen';
  } catch {
    return './volunteerHomeScreen';
  }
};

export default function FeedbackScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [homeScreen, setHomeScreen] = useState<string>('./volunteerHomeScreen');
  const [menuVisible, setMenuVisible] = useState(false);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  
  // New feedback form
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    getHomeScreen().then(setHomeScreen);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        router.push('/');
        return;
      }

      await loadFeedback();
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadFeedback = async () => {
    try {
      const data = await feedbackAPI.listMine();
      setFeedbackList(data);
    } catch (error) {
      console.error('Error loading feedback:', error);
      // Fallback: empty list if API not available
      setFeedbackList([]);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter your feedback message');
      return;
    }

    setSubmitting(true);
    try {
      await feedbackAPI.create(message.trim(), rating);
      Alert.alert('Success', 'Thank you for your feedback!');
      setMessage('');
      setRating(5);
      setShowForm(false);
      await loadFeedback();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    Alert.alert(
      'Delete Feedback',
      'Are you sure you want to delete this feedback?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await feedbackAPI.delete(feedbackId);
              setFeedbackList(prev => prev.filter(f => f.id !== feedbackId));
              Alert.alert('Success', 'Feedback deleted');
            } catch (error) {
              console.error('Error deleting feedback:', error);
              Alert.alert('Error', 'Failed to delete feedback');
            }
          },
        },
      ]
    );
  };

  const renderStars = (count: number, interactive: boolean = false, onPress?: (n: number) => void) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => interactive && onPress?.(n)}
            disabled={!interactive}
          >
            <Ionicons
              name={n <= count ? 'star' : 'star-outline'}
              size={24}
              color="#d4ff00"
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderFeedbackItem = ({ item }: { item: FeedbackItem }) => (
    <View style={styles.feedbackCard}>
      <View style={styles.feedbackHeader}>
        <Text style={styles.feedbackDate}>
          {new Date(item.timestamp).toLocaleDateString()}
        </Text>
        <TouchableOpacity onPress={() => handleDeleteFeedback(item.id)}>
          <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
        </TouchableOpacity>
      </View>
      
      {item.rating && renderStars(item.rating)}
      
      <Text style={styles.feedbackMessage}>{item.message}</Text>
      
      {item.response && (
        <View style={styles.responseContainer}>
          <Text style={styles.responseLabel}>Admin Response:</Text>
          <Text style={styles.responseText}>{item.response}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#d4ff00" style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push(homeScreen as any)} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Feedback</Text>
          <View style={styles.underline} />
        </View>

        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* New Feedback Button */}
      <TouchableOpacity
        style={styles.newFeedbackButton}
        onPress={() => setShowForm(!showForm)}
      >
        <Ionicons name={showForm ? 'close' : 'add'} size={24} color="#2d3e34" />
        <Text style={styles.newFeedbackText}>
          {showForm ? 'Cancel' : 'New Feedback'}
        </Text>
      </TouchableOpacity>

      {/* Feedback Form */}
      {showForm && (
        <View style={styles.formContainer}>
          <Text style={styles.formLabel}>Your Rating</Text>
          {renderStars(rating, true, setRating)}
          
          <Text style={styles.formLabel}>Your Message</Text>
          <TextInput
            style={styles.textArea}
            value={message}
            onChangeText={setMessage}
            placeholder="Tell us about your experience..."
            placeholderTextColor="#888"
            multiline
            numberOfLines={4}
          />
          
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmitFeedback}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#2d3e34" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Feedback</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Feedback List */}
      <FlatList
        data={feedbackList}
        keyExtractor={(item) => item.id}
        renderItem={renderFeedbackItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-outline" size={48} color="#666" />
            <Text style={styles.emptyText}>No feedback yet</Text>
            <Text style={styles.emptySubtext}>
              Share your thoughts to help us improve!
            </Text>
          </View>
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
    fontSize: 32,
    fontWeight: '500',
    color: '#fff',
  },
  underline: {
    height: 3,
    backgroundColor: '#d4ff00',
    marginTop: 4,
    width: '100%',
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
  newFeedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d4ff00',
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  newFeedbackText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3e34',
  },
  formContainer: {
    backgroundColor: '#2d3e34',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d4ff00',
    marginBottom: 8,
    marginTop: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  textArea: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#d4ff00',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3e34',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  feedbackCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  feedbackDate: {
    fontSize: 12,
    color: '#888',
  },
  feedbackMessage: {
    fontSize: 16,
    color: '#fff',
    marginTop: 12,
    lineHeight: 22,
  },
  responseContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#3d4f44',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#d4ff00',
  },
  responseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d4ff00',
    marginBottom: 4,
  },
  responseText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
