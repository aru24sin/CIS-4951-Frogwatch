// app/(tabs)/settingsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut, updatePassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

type UserData = {
  firstName: string;
  lastName: string;
  username: string;
  dateOfBirth: string;
  email: string;
  isExpert: boolean;
  phoneNumber?: string;
  bio?: string;
  location?: string;
};

type UserSettings = {
  notifications: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    recordingUpdates: boolean;
    expertResponses: boolean;
    weeklyDigest: boolean;
    soundEnabled: boolean;
  };
  permissions: {
    locationAlways: boolean;
    locationInUse: boolean;
    microphone: boolean;
    camera: boolean;
    photoLibrary: boolean;
  };
  privacy: {
    profileVisible: boolean;
    showLocation: boolean;
    showRecordings: boolean;
    allowDataCollection: boolean;
  };
  preferences: {
    darkMode: boolean;
    language: string;
    units: 'metric' | 'imperial';
    autoPlay: boolean;
    highQualityAudio: boolean;
  };
};

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    notifications: {
      pushEnabled: true,
      emailEnabled: true,
      recordingUpdates: true,
      expertResponses: true,
      weeklyDigest: false,
      soundEnabled: true,
    },
    permissions: {
      locationAlways: false,
      locationInUse: true,
      microphone: true,
      camera: true,
      photoLibrary: true,
    },
    privacy: {
      profileVisible: true,
      showLocation: true,
      showRecordings: true,
      allowDataCollection: true,
    },
    preferences: {
      darkMode: true,
      language: 'English',
      units: 'imperial',
      autoPlay: false,
      highQualityAudio: true,
    },
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
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

        // Load user settings
        const settingsDoc = await getDoc(doc(db, 'userSettings', user.uid));
        if (settingsDoc.exists()) {
          setSettings(settingsDoc.data() as UserSettings);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSectionPress = (section: string) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
      setEditMode(false);
    }
  };

  const updateSettings = async (newSettings: UserSettings) => {
    try {
      if (!auth.currentUser) return;
      await updateDoc(doc(db, 'userSettings', auth.currentUser.uid), newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
      Alert.alert('Error', 'Failed to update settings');
    }
  };

  const handleRemoveExpertAccess = async () => {
    Alert.alert(
      'Remove Expert Access',
      'Are you sure you want to remove your expert access?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (auth.currentUser) {
                await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                  isExpert: false,
                });
                setUserData(prev => prev ? { ...prev, isExpert: false } : null);
                Alert.alert('Success', 'Expert access removed');
              }
            } catch (error) {
              console.error('Error removing expert access:', error);
              Alert.alert('Error', 'Failed to remove expert access');
            }
          },
        },
      ]
    );
  };

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

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              router.push('/');
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Confirmation', 'Please type "DELETE" to confirm', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Confirm',
                style: 'destructive',
                onPress: async () => {
                  try {
                    if (auth.currentUser) {
                      await auth.currentUser.delete();
                      router.push('/');
                    }
                  } catch (error) {
                    Alert.alert('Error', 'Failed to delete account. Please try logging out and back in first.');
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  };

  const allSections = [
    'Account',
    'Notifications',
    'Permissions',
    'Privacy',
    'Preferences',
    'Access',
    'About',
    'Help & Support'
  ];

  const filteredSections = allSections.filter(section =>
    section.toLowerCase().includes(searchQuery.toLowerCase())
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#2d3e34" />
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.underline} />
        </View>

        <TouchableOpacity onPress={() => Alert.alert('Menu pressed')} style={styles.menuButton}>
          <Ionicons name="menu" size={28} color="#2d3e34" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Picture */}
        {!expandedSection && (
          <View style={styles.profilePictureContainer}>
            <View style={styles.profilePicture}>
              <Ionicons name="person" size={80} color="#d4ff00" />
            </View>
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={24} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Settings Sections */}
        <View style={styles.sectionsContainer}>
          {filteredSections.map((section) => (
            <View key={section}>
              <TouchableOpacity
                style={styles.sectionButton}
                onPress={() => handleSectionPress(section)}
              >
                <Text style={styles.sectionButtonText}>{section}</Text>
              </TouchableOpacity>

              {/* Expanded Section Content */}
              {expandedSection === section && (
                <View style={styles.expandedContent}>
                  {/* Account Section */}
                  {section === 'Account' && userData && (
                    <View style={styles.accountContent}>
                      {editMode ? (
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
                              value={userData.email}
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
                                setEditFirstName(userData.firstName);
                                setEditLastName(userData.lastName);
                                setEditUsername(userData.username);
                                setEditPassword('');
                                setEditDOB(userData.dateOfBirth);
                                setEditPhone(userData.phoneNumber || '');
                                setEditBio(userData.bio || '');
                                setEditLocation(userData.location || '');
                              }}
                            >
                              <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.saveButton}
                              onPress={handleSaveChanges}
                            >
                              <Text style={styles.saveButtonText}>Save</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Name</Text>
                            <Text style={styles.infoValue}>
                              {userData.firstName} {userData.lastName}
                            </Text>
                          </View>

                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Username</Text>
                            <Text style={styles.infoValue}>{userData.username}</Text>
                          </View>

                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Email</Text>
                            <Text style={styles.infoValue}>{userData.email}</Text>
                          </View>

                          {userData.phoneNumber && (
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>Phone</Text>
                              <Text style={styles.infoValue}>{userData.phoneNumber}</Text>
                            </View>
                          )}

                          {userData.location && (
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>Location</Text>
                              <Text style={styles.infoValue}>{userData.location}</Text>
                            </View>
                          )}

                          {userData.bio && (
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>Bio</Text>
                              <Text style={styles.infoValue}>{userData.bio}</Text>
                            </View>
                          )}

                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Date of Birth</Text>
                            <Text style={styles.infoValue}>{userData.dateOfBirth}</Text>
                          </View>

                          <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => setEditMode(true)}
                          >
                            <Text style={styles.editButtonText}>Edit Profile</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.logoutButton}
                            onPress={handleLogout}
                          >
                            <Text style={styles.logoutButtonText}>Logout</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={handleDeleteAccount}
                          >
                            <Text style={styles.deleteButtonText}>Delete Account</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                  {/* Notifications Section */}
                  {section === 'Notifications' && (
                    <View style={styles.settingsContent}>
                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Push Notifications</Text>
                        <Switch
                          value={settings.notifications.pushEnabled}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, pushEnabled: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Email Notifications</Text>
                        <Switch
                          value={settings.notifications.emailEnabled}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, emailEnabled: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Recording Updates</Text>
                        <Switch
                          value={settings.notifications.recordingUpdates}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, recordingUpdates: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Expert Responses</Text>
                        <Switch
                          value={settings.notifications.expertResponses}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, expertResponses: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Weekly Digest</Text>
                        <Switch
                          value={settings.notifications.weeklyDigest}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, weeklyDigest: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Notification Sounds</Text>
                        <Switch
                          value={settings.notifications.soundEnabled}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, soundEnabled: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>
                    </View>
                  )}

                  {/* Permissions Section */}
                  {section === 'Permissions' && (
                    <View style={styles.settingsContent}>
                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Location (Always)</Text>
                          <Text style={styles.settingDescription}>
                            Allow access to location at all times
                          </Text>
                        </View>
                        <Switch
                          value={settings.permissions.locationAlways}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              permissions: { ...settings.permissions, locationAlways: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Location (While Using)</Text>
                          <Text style={styles.settingDescription}>
                            Allow access only while using the app
                          </Text>
                        </View>
                        <Switch
                          value={settings.permissions.locationInUse}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              permissions: { ...settings.permissions, locationInUse: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Microphone</Text>
                          <Text style={styles.settingDescription}>
                            Required for recording frog calls
                          </Text>
                        </View>
                        <Switch
                          value={settings.permissions.microphone}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              permissions: { ...settings.permissions, microphone: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Camera</Text>
                          <Text style={styles.settingDescription}>
                            For taking photos of frogs
                          </Text>
                        </View>
                        <Switch
                          value={settings.permissions.camera}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              permissions: { ...settings.permissions, camera: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Photo Library</Text>
                          <Text style={styles.settingDescription}>
                            Access to save and upload photos
                          </Text>
                        </View>
                        <Switch
                          value={settings.permissions.photoLibrary}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              permissions: { ...settings.permissions, photoLibrary: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>
                    </View>
                  )}

                  {/* Privacy Section */}
                  {section === 'Privacy' && (
                    <View style={styles.settingsContent}>
                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Profile Visibility</Text>
                          <Text style={styles.settingDescription}>
                            Allow others to see your profile
                          </Text>
                        </View>
                        <Switch
                          value={settings.privacy.profileVisible}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              privacy: { ...settings.privacy, profileVisible: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Show Location</Text>
                          <Text style={styles.settingDescription}>
                            Display your location on recordings
                          </Text>
                        </View>
                        <Switch
                          value={settings.privacy.showLocation}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              privacy: { ...settings.privacy, showLocation: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Show Recordings</Text>
                          <Text style={styles.settingDescription}>
                            Make your recordings publicly visible
                          </Text>
                        </View>
                        <Switch
                          value={settings.privacy.showRecordings}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              privacy: { ...settings.privacy, showRecordings: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Data Collection</Text>
                          <Text style={styles.settingDescription}>
                            Allow anonymous usage data collection
                          </Text>
                        </View>
                        <Switch
                          value={settings.privacy.allowDataCollection}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              privacy: { ...settings.privacy, allowDataCollection: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>View Privacy Policy</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>Download My Data</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Preferences Section */}
                  {section === 'Preferences' && (
                    <View style={styles.settingsContent}>
                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Dark Mode</Text>
                        <Switch
                          value={settings.preferences.darkMode}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              preferences: { ...settings.preferences, darkMode: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>Auto-play Audio</Text>
                        <Switch
                          value={settings.preferences.autoPlay}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              preferences: { ...settings.preferences, autoPlay: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <Text style={styles.settingLabel}>High Quality Audio</Text>
                        <Switch
                          value={settings.preferences.highQualityAudio}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              preferences: { ...settings.preferences, highQualityAudio: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#767577', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingSection}>
                        <Text style={styles.sectionLabel}>Language</Text>
                        <TouchableOpacity style={styles.selectButton}>
                          <Text style={styles.selectButtonText}>{settings.preferences.language}</Text>
                          <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.settingSection}>
                        <Text style={styles.sectionLabel}>Units</Text>
                        <View style={styles.segmentedControl}>
                          <TouchableOpacity
                            style={[
                              styles.segmentButton,
                              settings.preferences.units === 'metric' && styles.segmentButtonActive
                            ]}
                            onPress={() => {
                              const newSettings = {
                                ...settings,
                                preferences: { ...settings.preferences, units: 'metric' as const }
                              };
                              updateSettings(newSettings);
                            }}
                          >
                            <Text style={[
                              styles.segmentButtonText,
                              settings.preferences.units === 'metric' && styles.segmentButtonTextActive
                            ]}>Metric</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.segmentButton,
                              settings.preferences.units === 'imperial' && styles.segmentButtonActive
                            ]}
                            onPress={() => {
                              const newSettings = {
                                ...settings,
                                preferences: { ...settings.preferences, units: 'imperial' as const }
                              };
                              updateSettings(newSettings);
                            }}
                          >
                            <Text style={[
                              styles.segmentButtonText,
                              settings.preferences.units === 'imperial' && styles.segmentButtonTextActive
                            ]}>Imperial</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>Clear Cache</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>Reset All Settings</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Access Section */}
                  {section === 'Access' && userData && (
                    <View style={styles.accessContent}>
                      {userData.isExpert ? (
                        <>
                          <Text style={styles.accessTitle}>
                            You have received{'\n'}Expert access
                          </Text>

                          <Text style={styles.removeAccessText}>
                            Remove expert access?
                          </Text>
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={handleRemoveExpertAccess}
                          >
                            <Text style={styles.removeButtonText}>Remove</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Text style={styles.accessTitle}>
                            You do not have expert access
                          </Text>
                          <Text style={styles.accessDescription}>
                            Expert access allows you to review and verify frog recordings submitted by users.
                          </Text>
                          <TouchableOpacity
                            style={styles.requestButton}
                            onPress={() => Alert.alert('Request Sent', 'Your expert access request has been submitted for review.')}
                          >
                            <Text style={styles.requestButtonText}>Request Expert Access</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                  {/* About Section */}
                  {section === 'About' && (
                    <View style={styles.aboutContent}>
                      <View style={styles.aboutItem}>
                        <Text style={styles.aboutLabel}>Version</Text>
                        <Text style={styles.aboutValue}>1.0.0</Text>
                      </View>

                      <View style={styles.aboutItem}>
                        <Text style={styles.aboutLabel}>Build Number</Text>
                        <Text style={styles.aboutValue}>100</Text>
                      </View>

                      <View style={styles.aboutItem}>
                        <Text style={styles.aboutLabel}>Last Updated</Text>
                        <Text style={styles.aboutValue}>October 15, 2025</Text>
                      </View>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>Check for Updates</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>Terms of Service</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>Privacy Policy</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.actionButton}>
                        <Text style={styles.actionButtonText}>Open Source Licenses</Text>
                      </TouchableOpacity>

                      <View style={styles.aboutFooter}>
                        <Text style={styles.aboutFooterText}>
                          FrogCatcher © 2025{'\n'}
                          Made with 🐸 for amphibian conservation
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Help & Support Section */}
                  {section === 'Help & Support' && (
                    <View style={styles.supportContent}>
                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="chatbubble-ellipses" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>Contact Support</Text>
                        <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="document-text" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>User Guide</Text>
                        <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="help-circle" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>FAQ</Text>
                        <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="bug" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>Report a Bug</Text>
                        <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="bulb" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>Feature Request</Text>
                        <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="school" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>Tutorial Videos</Text>
                        <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                      </TouchableOpacity>

                      <View style={styles.supportFooter}>
                        <Text style={styles.supportFooterText}>
                          Need immediate help?{'\n'}
                          Email: support@frogcatcher.app{'\n'}
                          Phone: 1-800-FROG-HELP
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3d5e44',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
    width: '80%',
  },
  menuButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  profilePictureContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  profilePicture: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#2d3e34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    borderWidth: 3,
    borderColor: '#d4ff00',
    paddingHorizontal: 15,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  sectionsContainer: {
    marginHorizontal: 20,
    backgroundColor: '#2d3e34',
    borderRadius: 20,
    padding: 20,
    marginBottom: 30,
  },
  sectionButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3e34',
  },
  expandedContent: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  accountContent: {
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#d4ff00',
  },
  infoLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    color: '#fff',
    maxWidth: '60%',
    textAlign: 'right',
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    borderBottomWidth: 2,
    borderBottomColor: '#d4ff00',
  },
  disabledInput: {
    backgroundColor: '#e0e0e0',
    color: '#666',
  },
  textArea: {
    height: 80,
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
    paddingVertical: 12,
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
    paddingVertical: 12,
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
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  editButtonText: {
    fontSize: 16,
    color: '#2d3e34',
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: '#5d6f64',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#d9534f',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  settingsContent: {
    gap: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: '#aaa',
  },
  settingSection: {
    gap: 8,
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2d3e34',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d4ff00',
  },
  selectButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#2d3e34',
    borderRadius: 8,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#d4ff00',
  },
  segmentButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  segmentButtonTextActive: {
    color: '#2d3e34',
    fontWeight: '700',
  },
  actionButton: {
    backgroundColor: '#2d3e34',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d4ff00',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#d4ff00',
    fontWeight: '500',
  },
  accessContent: {
    alignItems: 'center',
    gap: 16,
  },
  accessTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
  },
  accessDescription: {
    fontSize: 15,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 22,
  },
  takeLookButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 50,
    marginTop: 8,
  },
  takeLookButtonText: {
    fontSize: 18,
    color: '#2d3e34',
    fontWeight: '700',
  },
  removeAccessText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 20,
  },
  removeButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 50,
  },
  removeButtonText: {
    fontSize: 18,
    color: '#2d3e34',
    fontWeight: '700',
  },
  requestButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 8,
  },
  requestButtonText: {
    fontSize: 18,
    color: '#2d3e34',
    fontWeight: '700',
  },
  aboutContent: {
    gap: 12,
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#5d6f64',
  },
  aboutLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  aboutValue: {
    fontSize: 16,
    color: '#d4ff00',
  },
  aboutFooter: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#d4ff00',
    alignItems: 'center',
  },
  aboutFooterText: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 22,
  },
  supportContent: {
    gap: 12,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d3e34',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d4ff00',
    gap: 12,
  },
  supportButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  supportFooter: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#d4ff00',
    alignItems: 'center',
  },
  supportFooterText: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 22,
  },
});