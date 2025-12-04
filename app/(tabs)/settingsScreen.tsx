// app/(tabs)/settingsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import NavigationMenu from '../../components/NavigationMenu';
import { auth, db } from '../firebaseConfig';
import { settingsAPI, usersAPI } from '../../services/api';

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

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [homeScreen, setHomeScreen] = useState<string>('./volunteerHomeScreen');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isExpert, setIsExpert] = useState(false);
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
          const userData = userDoc.data();
          // Check both role field (string) and boolean fields for compatibility
          const roleStr = (userData.role || '').toString().toLowerCase();
          setIsExpert(userData.isExpert === true || roleStr === 'expert');
        }

        // Load user settings from backend API
        try {
          const apiSettings = await settingsAPI.get();
          // Map backend format to frontend format
          setSettings({
            notifications: {
              pushEnabled: apiSettings.notifications?.push ?? true,
              emailEnabled: apiSettings.notifications?.email ?? true,
              recordingUpdates: apiSettings.notifications?.recording_updates ?? true,
              expertResponses: apiSettings.notifications?.expert_responses ?? true,
              weeklyDigest: apiSettings.notifications?.weekly_digest ?? false,
              soundEnabled: apiSettings.notifications?.sounds ?? true,
            },
            permissions: {
              locationAlways: apiSettings.permissions?.location_always ?? false,
              locationInUse: apiSettings.permissions?.location_while_using ?? true,
              microphone: apiSettings.permissions?.microphone ?? true,
              camera: apiSettings.permissions?.camera ?? true,
              photoLibrary: apiSettings.permissions?.photo_library ?? true,
            },
            privacy: {
              profileVisible: apiSettings.privacy?.profile_visible ?? true,
              showLocation: apiSettings.privacy?.show_location ?? true,
              showRecordings: apiSettings.privacy?.show_recordings ?? true,
              allowDataCollection: apiSettings.privacy?.data_collection ?? true,
            },
            preferences: {
              darkMode: apiSettings.preferences?.dark_mode ?? true,
              language: apiSettings.preferences?.language ?? 'English',
              units: apiSettings.preferences?.units === 'metric' ? 'metric' : 'imperial',
              autoPlay: apiSettings.preferences?.autoplay_audio ?? false,
              highQualityAudio: apiSettings.preferences?.high_quality_audio ?? true,
            },
          });
        } catch (apiError) {
          console.log('Backend API not available, using Firestore fallback');
          // Fallback to Firestore
          const settingsDoc = await getDoc(doc(db, 'userSettings', user.uid));
          if (settingsDoc.exists()) {
            setSettings(settingsDoc.data() as UserSettings);
          }
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
    }
  };

  const updateSettings = async (newSettings: UserSettings) => {
    try {
      if (!auth.currentUser) return;
      
      // Try to update via backend API first
      try {
        await settingsAPI.update({
          notifications: {
            push: newSettings.notifications.pushEnabled,
            email: newSettings.notifications.emailEnabled,
            recording_updates: newSettings.notifications.recordingUpdates,
            expert_responses: newSettings.notifications.expertResponses,
            weekly_digest: newSettings.notifications.weeklyDigest,
            sounds: newSettings.notifications.soundEnabled,
          },
          permissions: {
            location_always: newSettings.permissions.locationAlways,
            location_while_using: newSettings.permissions.locationInUse,
            microphone: newSettings.permissions.microphone,
            camera: newSettings.permissions.camera,
            photo_library: newSettings.permissions.photoLibrary,
          },
          privacy: {
            profile_visible: newSettings.privacy.profileVisible,
            show_location: newSettings.privacy.showLocation,
            show_recordings: newSettings.privacy.showRecordings,
            data_collection: newSettings.privacy.allowDataCollection,
          },
          preferences: {
            dark_mode: newSettings.preferences.darkMode,
            autoplay_audio: newSettings.preferences.autoPlay,
            high_quality_audio: newSettings.preferences.highQualityAudio,
            language: newSettings.preferences.language === 'English' ? 'en' : newSettings.preferences.language,
            units: newSettings.preferences.units,
          },
        });
      } catch (apiError) {
        console.log('Backend API not available, using Firestore fallback');
        // Fallback to Firestore - use setDoc with merge to create if doesn't exist
        await setDoc(doc(db, 'userSettings', auth.currentUser.uid), newSettings as any, { merge: true });
      }
      
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
                setIsExpert(false);
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
              router.replace('./landingScreen');
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
    'Notifications',
    'Permissions',
    'Privacy',
    'Preferences',
    'Expert Access',
    'About',
    'Help & Support',
    'Account Actions'
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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.innerContainer}>
        <NavigationMenu isVisible={menuVisible} onClose={() => setMenuVisible(false)} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push(homeScreen as any)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>

          <View>
            <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.underline} />
        </View>

        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={24} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search settings..."
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
                <Ionicons 
                  name={expandedSection === section ? 'chevron-up' : 'chevron-down'} 
                  size={20} 
                  color="#2d3e34" 
                />
              </TouchableOpacity>

              {/* Expanded Section Content */}
              {expandedSection === section && (
                <View style={styles.expandedContent}>
                  {/* Notifications Section */}
                  {section === 'Notifications' && (
                    <View style={styles.settingsContent}>
                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Push Notifications</Text>
                          <Text style={styles.settingDescription}>Receive push notifications</Text>
                        </View>
                        <Switch
                          value={settings.notifications.pushEnabled}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, pushEnabled: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Email Notifications</Text>
                          <Text style={styles.settingDescription}>Receive email updates</Text>
                        </View>
                        <Switch
                          value={settings.notifications.emailEnabled}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, emailEnabled: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Recording Updates</Text>
                          <Text style={styles.settingDescription}>Get notified about recording status</Text>
                        </View>
                        <Switch
                          value={settings.notifications.recordingUpdates}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, recordingUpdates: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Sound</Text>
                          <Text style={styles.settingDescription}>Play sounds for notifications</Text>
                        </View>
                        <Switch
                          value={settings.notifications.soundEnabled}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              notifications: { ...settings.notifications, soundEnabled: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
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
                          <Text style={styles.settingDescription}>Allow location access always</Text>
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
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Location (In Use)</Text>
                          <Text style={styles.settingDescription}>Allow location when using app</Text>
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
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Microphone</Text>
                          <Text style={styles.settingDescription}>Required for recording</Text>
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
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Camera</Text>
                          <Text style={styles.settingDescription}>Allow camera access</Text>
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
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
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
                          <Text style={styles.settingLabel}>Profile Visible</Text>
                          <Text style={styles.settingDescription}>Allow others to see your profile</Text>
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
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Show Location</Text>
                          <Text style={styles.settingDescription}>Display location on recordings</Text>
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
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Data Collection</Text>
                          <Text style={styles.settingDescription}>Allow anonymous usage data</Text>
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
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>
                    </View>
                  )}

                  {/* Preferences Section */}
                  {section === 'Preferences' && (
                    <View style={styles.settingsContent}>
                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Dark Mode</Text>
                          <Text style={styles.settingDescription}>Use dark theme</Text>
                        </View>
                        <Switch
                          value={settings.preferences.darkMode}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              preferences: { ...settings.preferences, darkMode: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>High Quality Audio</Text>
                          <Text style={styles.settingDescription}>Record in high quality</Text>
                        </View>
                        <Switch
                          value={settings.preferences.highQualityAudio}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              preferences: { ...settings.preferences, highQualityAudio: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
                      </View>

                      <View style={styles.settingItem}>
                        <View style={styles.settingInfo}>
                          <Text style={styles.settingLabel}>Auto-Play Audio</Text>
                          <Text style={styles.settingDescription}>Auto-play recordings in history</Text>
                        </View>
                        <Switch
                          value={settings.preferences.autoPlay}
                          onValueChange={(value) => {
                            const newSettings = {
                              ...settings,
                              preferences: { ...settings.preferences, autoPlay: value }
                            };
                            updateSettings(newSettings);
                          }}
                          trackColor={{ false: '#3d4f44', true: '#d4ff00' }}
                          thumbColor="#fff"
                        />
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
                    </View>
                  )}

                  {/* Expert Access Section */}
                  {section === 'Expert Access' && (
                    <View style={styles.accessContent}>
                      {isExpert ? (
                        <>
                          <View style={styles.expertBadgeContainer}>
                            <Ionicons name="shield-checkmark" size={48} color="#4db8e8" />
                          </View>
                          <Text style={styles.accessTitle}>You have Expert Access</Text>
                          <Text style={styles.accessDescription}>
                            You can review and verify recordings submitted by other users.
                          </Text>
                          <TouchableOpacity
                            style={styles.takeLookButton}
                            onPress={() => router.push('./expert')}
                          >
                            <Text style={styles.takeLookButtonText}>Review Queue</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={handleRemoveExpertAccess}
                          >
                            <Text style={styles.removeButtonText}>Remove Expert Access</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <View style={styles.expertBadgeContainer}>
                            <Ionicons name="shield-outline" size={48} color="#d4ff00" />
                          </View>
                          <Text style={styles.accessTitle}>Become an Expert</Text>
                          <Text style={styles.accessDescription}>
                            Experts can review and verify frog recordings submitted by volunteers. 
                            Request access to help improve data quality.
                          </Text>
                          <TouchableOpacity
                            style={styles.requestButton}
                            onPress={async () => {
                              try {
                                const user = auth.currentUser;
                                if (!user) {
                                  Alert.alert('Error', 'You must be logged in to request expert access.');
                                  return;
                                }
                                
                                // Update Firestore to mark user as pending expert
                                await updateDoc(doc(db, 'users', user.uid), {
                                  isPendingExpert: true,
                                  expertRequestedAt: new Date().toISOString(),
                                });
                                
                                Alert.alert(
                                  'Request Sent',
                                  'Your expert access request has been submitted. An admin will review your request.'
                                );
                              } catch (error) {
                                console.error('Error requesting expert access:', error);
                                Alert.alert('Error', 'Failed to submit request. Please try again.');
                              }
                            }}
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
                        <Text style={styles.aboutLabel}>Build</Text>
                        <Text style={styles.aboutValue}>2024.12.03</Text>
                      </View>
                      <View style={styles.aboutFooter}>
                        <Text style={styles.aboutFooterText}>
                          FrogWatch+ is dedicated to conservation{'\n'}through citizen science.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Help & Support Section */}
                  {section === 'Help & Support' && (
                    <View style={styles.supportContent}>
                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="help-circle-outline" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>FAQs</Text>
                        <Ionicons name="chevron-forward" size={20} color="#888" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="mail-outline" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>Contact Support</Text>
                        <Ionicons name="chevron-forward" size={20} color="#888" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="document-text-outline" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>Terms of Service</Text>
                        <Ionicons name="chevron-forward" size={20} color="#888" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.supportButton}>
                        <Ionicons name="lock-closed-outline" size={24} color="#d4ff00" />
                        <Text style={styles.supportButtonText}>Privacy Policy</Text>
                        <Ionicons name="chevron-forward" size={20} color="#888" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Account Actions Section */}
                  {section === 'Account Actions' && (
                    <View style={styles.accountActionsContent}>
                      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                        <Ionicons name="log-out-outline" size={24} color="#fff" />
                        <Text style={styles.logoutButtonText}>Logout</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
                        <Ionicons name="trash-outline" size={24} color="#fff" />
                        <Text style={styles.deleteButtonText}>Delete Account</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
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
  scrollContent: {
    paddingBottom: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },
  sectionsContainer: {
    marginBottom: 30,
  },
  sectionButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3e34',
  },
  expandedContent: {
    backgroundColor: '#2d3e34',
    borderRadius: 12,
    padding: 20,
    marginBottom: 8,
  },
  settingsContent: {
    gap: 8,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
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
    fontSize: 12,
    color: '#aaa',
  },
  settingSection: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 14,
    color: '#d4ff00',
    fontWeight: '500',
    marginBottom: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#3d4f44',
    borderRadius: 8,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#d4ff00',
  },
  segmentButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  segmentButtonTextActive: {
    color: '#2d3e34',
    fontWeight: '700',
  },
  accessContent: {
    alignItems: 'center',
    gap: 12,
  },
  expertBadgeContainer: {
    marginBottom: 8,
  },
  accessTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  accessDescription: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
  },
  takeLookButton: {
    backgroundColor: '#4db8e8',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    marginTop: 8,
  },
  takeLookButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  removeButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    marginTop: 8,
  },
  removeButtonText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  requestButton: {
    backgroundColor: '#d4ff00',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    marginTop: 8,
  },
  requestButtonText: {
    fontSize: 16,
    color: '#2d3e34',
    fontWeight: '700',
  },
  aboutContent: {
    gap: 8,
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
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
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212, 255, 0, 0.2)',
    alignItems: 'center',
  },
  aboutFooterText: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
  },
  supportContent: {
    gap: 8,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  supportButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  accountActionsContent: {
    gap: 12,
  },
  logoutButton: {
    backgroundColor: '#5d6f64',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#d9534f',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
