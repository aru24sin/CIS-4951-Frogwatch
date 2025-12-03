// app/(tabs)/profileScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, updatePassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NavigationMenu from '../../components/NavigationMenu';
import { auth, db } from '../firebaseConfig';

type UserData = {
  firstName: string;
  lastName: string;
  username: string;
  dateOfBirth: string;
  email: string;
  role?: string;
  isExpert?: boolean;
  isAdmin?: boolean;
  phoneNumber?: string;
  bio?: string;
  location?: string;
};

// Helper function to get the correct home screen based on user role
const getHomeScreen = async (): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) return './volunteerHomeScreen';
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data() || {};
    
    // Check both role field (string) and boolean fields for compatibility
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

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [homeScreen, setHomeScreen] = useState<string>('./volunteerHomeScreen');
  const [menuVisible, setMenuVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  // Edit state
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDOB, setEditDOB] = useState('');

  // Determine the correct home screen on mount
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

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);
          setEditFirstName(data.firstName);
          setEditLastName(data.lastName);
          setEditUsername(data.username);
          setEditDOB(data.dateOfBirth);
          setEditPhone(data.phoneNumber || '');
          setEditBio(data.bio || '');
          setEditLocation(data.location || '');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSaveChanges = async () => {
    try {
      if (!auth.currentUser) return;

      const updates: any = {
        firstName: editFirstName,
        lastName: editLastName,
        username: editUsername,
        dateOfBirth: editDOB,
        phoneNumber: editPhone,
        bio: editBio,
        location: editLocation,
      };

      await updateDoc(doc(db, 'users', auth.currentUser.uid), updates);

      // Update password if provided
      if (editPassword && editPassword.length >= 6) {
        await updatePassword(auth.currentUser, editPassword);
      }

      setUserData(prev => prev ? { ...prev, ...updates } : null);
      setEditMode(false);
      setEditPassword('');
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      console.error('Error saving changes:', error);
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert('Error', 'Please log out and log back in to change your password');
      } else {
        Alert.alert('Error', 'Failed to update profile');
      }
    }
  };

  const getRoleLabel = () => {
    const roleStr = (userData?.role || '').toString().toLowerCase();
    const isAdmin = userData?.isAdmin === true || roleStr === 'admin';
    const isExpert = userData?.isExpert === true || roleStr === 'expert';
    
    if (isAdmin) return 'Admin';
    if (isExpert) return 'Expert';
    return 'Volunteer';
  };

  const getRoleBadgeColor = () => {
    const roleStr = (userData?.role || '').toString().toLowerCase();
    const isAdmin = userData?.isAdmin === true || roleStr === 'admin';
    const isExpert = userData?.isExpert === true || roleStr === 'expert';
    
    if (isAdmin) return '#FF6B6B';
    if (isExpert) return '#4db8e8';
    return '#4CAF50';
  };

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
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.underline} />
        </View>

        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Picture */}
        <View style={styles.profilePictureContainer}>
          <View style={styles.profilePicture}>
            <Ionicons name="person" size={80} color="#d4ff00" />
          </View>
          <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor() }]}>
            <Text style={styles.roleText}>{getRoleLabel()}</Text>
          </View>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          {editMode ? (
            // Edit Mode
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First Name</Text>
                <TextInput
                  style={styles.input}
                  value={editFirstName}
                  onChangeText={setEditFirstName}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  value={editLastName}
                  onChangeText={setEditLastName}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={editUsername}
                  onChangeText={setEditUsername}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  value={userData?.email}
                  editable={false}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="(123) 456-7890"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location</Text>
                <TextInput
                  style={styles.input}
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="City, State"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bio</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor="#999"
                  multiline
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Password (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={editPassword}
                  onChangeText={setEditPassword}
                  placeholder="Enter new password (6+ characters)"
                  placeholderTextColor="#999"
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date of Birth</Text>
                <TextInput
                  style={styles.input}
                  value={editDOB}
                  onChangeText={setEditDOB}
                  placeholder="MM/DD/YY"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditMode(false);
                    if (userData) {
                      setEditFirstName(userData.firstName);
                      setEditLastName(userData.lastName);
                      setEditUsername(userData.username);
                      setEditPassword('');
                      setEditDOB(userData.dateOfBirth);
                      setEditPhone(userData.phoneNumber || '');
                      setEditBio(userData.bio || '');
                      setEditLocation(userData.location || '');
                    }
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveChanges}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // View Mode
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>
                  {userData?.firstName} {userData?.lastName}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Username</Text>
                <Text style={styles.infoValue}>{userData?.username}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{userData?.email}</Text>
              </View>

              {userData?.phoneNumber && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{userData.phoneNumber}</Text>
                </View>
              )}

              {userData?.location && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Location</Text>
                  <Text style={styles.infoValue}>{userData.location}</Text>
                </View>
              )}

              {userData?.bio && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Bio</Text>
                  <Text style={styles.infoValue}>{userData.bio}</Text>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date of Birth</Text>
                <Text style={styles.infoValue}>{userData?.dateOfBirth}</Text>
              </View>

              <TouchableOpacity style={styles.editButton} onPress={() => setEditMode(true)}>
                <Ionicons name="create-outline" size={20} color="#2d3e34" style={{ marginRight: 8 }} />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
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
    textAlign: 'center',
  },
  underline: {
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  profilePictureContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  profilePicture: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#2d3e34',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#d4ff00',
  },
  roleBadge: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  profileCard: {
    backgroundColor: '#2d3e34',
    borderRadius: 20,
    padding: 20,
    marginBottom: 30,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 255, 0, 0.2)',
  },
  infoLabel: {
    fontSize: 16,
    color: '#d4ff00',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    color: '#fff',
    maxWidth: '60%',
    textAlign: 'right',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#d4ff00',
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#333',
  },
  disabledInput: {
    backgroundColor: '#e0e0e0',
    color: '#666',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#5d6f64',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    color: '#2d3e34',
    fontWeight: '700',
  },
  editButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 16,
    color: '#2d3e34',
    fontWeight: '700',
  },
});
