// app/(tabs)/mapHistoryScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  DocumentData, onSnapshot, query, Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
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
  timestamp?: Date;
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

function pickDevHost() {
  const hostUri =
    (Constants as any)?.expoGoConfig?.hostUri ??
    (Constants as any)?.expoGoConfig?.debuggerHost ??
    (Constants as any)?.expoConfig?.hostUri ??
    '';

  if (hostUri) {
    const h = String(hostUri).split(':')[0];
    if (h) return h;
  }

  const scriptURL: string | undefined = (NativeModules as any)?.SourceCode?.scriptURL;
  const m = scriptURL?.match(/\/\/([^/:]+):\d+/);
  return m?.[1] ?? 'localhost';
}
const API_BASE = __DEV__ ? `http://${pickDevHost()}:8000` : 'https://your-production-domain';

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

export default function MapHistoryScreen() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [expandedRecording, setExpandedRecording] = useState<Recording | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editSpecies, setEditSpecies] = useState('');
  const [editConfidence, setEditConfidence] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [showSpeciesDropdown, setShowSpeciesDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Date filter state
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectingStartDate, setSelectingStartDate] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  
  // Species filter state
  const [selectedSpecies, setSelectedSpecies] = useState<Set<string>>(new Set());
  const [showSpeciesPicker, setShowSpeciesPicker] = useState(false);
  
  const mapRef = useRef<MapView>(null);

  const initialRegion = useMemo(() => {
    const first = recordings[0];
    return {
      latitude: first?.location.latitude ?? 42.3314,
      longitude: first?.location.longitude ?? -83.0458,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  }, [recordings]);

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

      const q = query(collection(db, 'recordings'), where('userId', '==', user.uid));

      offSnap = onSnapshot(
        q,
        async (snap) => {
          const rows: Recording[] = [];
          let index = 1;
          
          for (const doc of snap.docs) {
            const d = doc.data() as DocumentData;
            const ts: Timestamp | undefined = d.timestamp;
            const timestampDate = ts?.toDate?.();
            const timestampISO = timestampDate?.toLocaleDateString?.() ?? d.timestamp_iso ?? 'Unknown';

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
              timestamp: timestampDate,
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
          console.error('Error fetching recordings:', err);
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

  // All available species from the app
  const allSpeciesOptions = [
    'Bullfrog',
    'Green Frog',
    'Northern Spring Peeper',
    'Northern Leopard Frog',
    'Eastern Gray Treefrog',
    'Wood Frog',
    'American Toad',
    'Midland Chorus Frog'
  ];

  const filteredRecordings = useMemo(() => {
    return recordings.filter((rec) => {
      // Species filter
      if (selectedSpecies.size > 0 && !selectedSpecies.has(rec.predictedSpecies)) {
        return false;
      }
      
      // Date filter
      if (startDate && rec.timestamp && rec.timestamp < startDate) {
        return false;
      }
      if (endDate && rec.timestamp) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (rec.timestamp > endOfDay) {
          return false;
        }
      }
      
      return true;
    });
  }, [recordings, selectedSpecies, startDate, endDate]);

  const handleMarkerPress = (rec: Recording) => {
    setSelectedRecording(rec);
    setExpandedRecording(null);
    setEditMode(false);
    mapRef.current?.animateToRegion({
      latitude: rec.location.latitude,
      longitude: rec.location.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
  };

  const handleCardPress = () => {
    if (selectedRecording) {
      setExpandedRecording(selectedRecording);
      setEditMode(false);
      setEditSpecies(selectedRecording.species || selectedRecording.predictedSpecies);
      setEditConfidence(String(selectedRecording.confidence ?? ''));
      setEditNotes(selectedRecording.notes ?? '');
      setShowSpeciesDropdown(false);
    }
  };

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

  const handleEdit = () => {
    if (editMode) {
      // Save changes
      handleSaveEdits();
    } else {
      setEditMode(true);
    }
  };

  const handleSaveEdits = async () => {
    if (!expandedRecording) return;
    
    setIsSaving(true);
    try {
      const recordingRef = doc(db, 'recordings', expandedRecording.recordingId);
      
      const updates: any = {
        species: editSpecies,
        notes: editNotes,
      };
      
      // Only update confidence if it's a valid number
      const confidenceNum = parseFloat(editConfidence);
      if (!isNaN(confidenceNum) && confidenceNum >= 0 && confidenceNum <= 100) {
        updates.confidenceScore = confidenceNum / 100;
      }
      
      await updateDoc(recordingRef, updates);
      
      // Update local state
      setExpandedRecording({
        ...expandedRecording,
        species: editSpecies,
        predictedSpecies: editSpecies,
        confidence: confidenceNum,
        notes: editNotes,
      });
      
      setEditMode(false);
      Alert.alert('Success', 'Changes saved successfully');
    } catch (error) {
      console.error('Error saving edits:', error);
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResubmit = () => {
    Alert.alert('Resubmit', 'Recording resubmitted for review');
  };

  const handleClose = () => {
    setExpandedRecording(null);
    setEditMode(false);
  };

  const toggleSpecies = (species: string) => {
    const newSelected = new Set(selectedSpecies);
    if (newSelected.has(species)) {
      newSelected.delete(species);
    } else {
      newSelected.add(species);
    }
    setSelectedSpecies(newSelected);
  };

  const clearAllSpecies = () => {
    setSelectedSpecies(new Set());
  };

  const selectAllSpecies = () => {
    setSelectedSpecies(new Set(allSpeciesOptions));
  };

  const handleDateSelect = (date: Date) => {
    if (selectingStartDate) {
      setStartDate(date);
      setSelectingStartDate(false);
    } else {
      setEndDate(date);
    }
  };

  const clearDateFilter = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectingStartDate(true);
  };

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToPreviousYear = () => {
    setCurrentYear(currentYear - 1);
  };

  const goToNextYear = () => {
    setCurrentYear(currentYear + 1);
  };

  const getDateFilterText = () => {
    if (!startDate && !endDate) return 'Date Range';
    if (startDate && !endDate) return `From ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    if (!startDate && endDate) return `Until ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return `${startDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const getSpeciesFilterText = () => {
    if (selectedSpecies.size === 0) return 'All Species';
    if (selectedSpecies.size === 1) return Array.from(selectedSpecies)[0];
    return `${selectedSpecies.size} Species`;
  };

  // Simple calendar generator
  const generateCalendar = () => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(currentYear, currentMonth, i));
    }
    
    return { days, month: currentMonth, year: currentYear };
  };

  const calendar = generateCalendar();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#b8e986" style={{ marginTop: 100 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#333" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Map</Text>

        <TouchableOpacity onPress={() => Alert.alert('Menu pressed')} style={styles.menuButton}>
          <Ionicons name="menu" size={28} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
      >
        {filteredRecordings.map((rec) => (
          <Marker
            key={rec.recordingId}
            coordinate={rec.location}
            onPress={() => handleMarkerPress(rec)}
          >
            <View style={styles.customMarker}>
              <Ionicons name="location" size={40} color="#2d5a3d" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => {
            setShowDatePicker(true);
            setSelectingStartDate(true);
          }}
        >
          <Text style={styles.filterButtonText}>{getDateFilterText()}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setShowSpeciesPicker(true)}
        >
          <Text style={styles.filterButtonText}>{getSpeciesFilterText()}</Text>
        </TouchableOpacity>
      </View>

      {/* Selected Recording Card (collapsed) */}
      {selectedRecording && !expandedRecording && (
        <TouchableOpacity 
          style={styles.selectedCard}
          onPress={handleCardPress}
          activeOpacity={0.9}
        >
          <View style={styles.selectedCardContent}>
            <View style={styles.selectedCardLeft}>
              <View style={styles.speciesTag}>
                <Text style={styles.speciesTagText}>Frog Spec #{selectedRecording.recordingNumber}</Text>
              </View>
              <Text style={styles.confidenceText}>Confidence: {selectedRecording.confidence}</Text>
            </View>
            <Image 
              source={speciesImageMap[selectedRecording.predictedSpecies] || placeholderImage} 
              style={styles.selectedCardImage} 
            />
          </View>
        </TouchableOpacity>
      )}

      {/* Expanded Recording Modal */}
      {expandedRecording && (
        <View style={styles.expandedModal}>
          <TouchableOpacity 
            style={styles.modalOverlay}
            onPress={handleClose}
            activeOpacity={1}
          />
          
          <View style={styles.expandedCard}>
            <View style={styles.expandedHeader}>
              <View style={styles.expandedHeaderTop}>
                <View style={styles.speciesTag}>
                  <Text style={styles.speciesTagText}>Frog Spec #{expandedRecording.recordingNumber}</Text>
                </View>
                <Image 
                    source={speciesImageMap[expandedRecording.predictedSpecies] || placeholderImage} 
                    style={styles.expandedHeaderImage} 
                  />
                <View style={styles.expandedHeaderContent}>
                  <View style={styles.statusIcon}>
                    <Ionicons name="cloud-upload" size={24} color="#4db8e8" />
                  </View>
                  <Text style={styles.locationText}>{expandedRecording.locationCity}</Text>
                </View>
              </View>
            </View>

            <ScrollView style={styles.expandedContent} showsVerticalScrollIndicator={false}>
              <View style={styles.dateEditRow}>
                <Text style={styles.expandedDate}>{expandedRecording.timestampISO}</Text>
                <TouchableOpacity onPress={handleEdit} disabled={isSaving}>
                  <Text style={styles.editText}>
                    {isSaving ? 'saving...' : editMode ? 'save' : 'edit'}
                  </Text>
                </TouchableOpacity>
              </View>

              {editMode ? (
                <View style={styles.editContainer}>
                  <TouchableOpacity 
                    style={styles.dropdownPlaceholder}
                    onPress={() => setShowSpeciesDropdown(!showSpeciesDropdown)}
                  >
                    <Text style={styles.dropdownText}>
                      {editSpecies || 'Select Species'} ▼
                    </Text>
                  </TouchableOpacity>
                  
                  {showSpeciesDropdown && (
                    <View style={styles.dropdownMenu}>
                      <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                        {allSpeciesOptions.map((species) => (
                          <TouchableOpacity
                            key={species}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setEditSpecies(species);
                              setShowSpeciesDropdown(false);
                            }}
                          >
                            <Image 
                              source={speciesImageMap[species] || placeholderImage} 
                              style={styles.dropdownItemImage} 
                            />
                            <Text style={styles.dropdownItemText}>{species}</Text>
                            {editSpecies === species && (
                              <Ionicons name="checkmark" size={24} color="#d4ff00" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  
                  <TextInput
                    style={styles.editInput}
                    value={editConfidence}
                    onChangeText={setEditConfidence}
                    placeholder="Confidence Score (0-100)"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.editInput, styles.notesInput]}
                    value={editNotes}
                    onChangeText={setEditNotes}
                    placeholder="Notes made by volunteer or expert"
                    placeholderTextColor="#999"
                    multiline
                  />
                </View>
              ) : (
                <>
                  <View style={styles.dropdownPlaceholder}>
                    <Text style={styles.dropdownText}>
                      {expandedRecording.species || expandedRecording.predictedSpecies}
                    </Text>
                  </View>
                  <View style={styles.scoreContainer}>
                    <View style={styles.scoreBox}>
                      <Text style={styles.scoreLabel}>score</Text>
                      <Text style={styles.scoreValue}>{expandedRecording.confidence ?? 'N/A'}</Text>
                    </View>
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>
                        {expandedRecording.notes || 'Notes made by volunteer or expert'}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => handlePlay(expandedRecording.audioURL)}
                >
                  <Text style={styles.playButtonText}>play</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.resubmitButton} onPress={handleResubmit}>
                  <Text style={styles.resubmitButtonText}>resubmit</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.uploaderInfo}>
                <Text style={styles.uploaderName}>{expandedRecording.submitterName}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* Date Range Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalBackground}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={(e) => e.stopPropagation()}
            style={styles.datePickerModal}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectingStartDate ? 'Select Start Date' : 'Select End Date'}
              </Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            {startDate && (
              <View style={styles.selectedDatesContainer}>
                <Text style={styles.selectedDateText}>
                  Start: {startDate.toLocaleDateString()}
                </Text>
                {endDate && (
                  <Text style={styles.selectedDateText}>
                    End: {endDate.toLocaleDateString()}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.calendarHeader}>
              <View style={styles.navigationRow}>
                <TouchableOpacity onPress={goToPreviousYear} style={styles.navButton}>
                  <Ionicons name="chevron-back" size={20} color="#d4ff00" />
                  <Ionicons name="chevron-back" size={20} color="#d4ff00" style={{ marginLeft: -12 }} />
                </TouchableOpacity>
                <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
                  <Ionicons name="chevron-back" size={24} color="#d4ff00" />
                </TouchableOpacity>
                <Text style={styles.monthYearText}>
                  {new Date(calendar.year, calendar.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
                  <Ionicons name="chevron-forward" size={24} color="#d4ff00" />
                </TouchableOpacity>
                <TouchableOpacity onPress={goToNextYear} style={styles.navButton}>
                  <Ionicons name="chevron-forward" size={20} color="#d4ff00" />
                  <Ionicons name="chevron-forward" size={20} color="#d4ff00" style={{ marginLeft: -12 }} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.weekDaysRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} style={styles.weekDayText}>{day}</Text>
              ))}
            </View>

            <ScrollView style={styles.calendarScroll}>
              <View style={styles.calendarGrid}>
                {calendar.days.map((date, index) => {
                  if (!date) {
                    return <View key={`empty-${index}`} style={styles.emptyDay} />;
                  }

                  const isStartDate = startDate && date.toDateString() === startDate.toDateString();
                  const isEndDate = endDate && date.toDateString() === endDate.toDateString();
                  const isInRange = startDate && endDate && date >= startDate && date <= endDate;
                  const isToday = date.toDateString() === new Date().toDateString();

                  return (
                    <TouchableOpacity
                      key={date.toISOString()}
                      style={[
                        styles.dayCell,
                        (isStartDate || isEndDate) && styles.selectedDay,
                        isInRange && !isStartDate && !isEndDate && styles.rangeDay,
                      ]}
                      onPress={() => handleDateSelect(date)}
                    >
                      <Text style={[
                        styles.dayText,
                        (isStartDate || isEndDate) && styles.selectedDayText,
                        isToday && styles.todayText,
                      ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.datePickerActions}>
              <TouchableOpacity 
                style={styles.clearButton}
                onPress={() => {
                  clearDateFilter();
                  setShowDatePicker(false);
                }}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.applyButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Species Filter Modal */}
      <Modal
        visible={showSpeciesPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSpeciesPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalBackground}
          activeOpacity={1}
          onPress={() => setShowSpeciesPicker(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.speciesPickerModal}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Species</Text>
              <TouchableOpacity onPress={() => setShowSpeciesPicker(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.speciesActions}>
              <TouchableOpacity onPress={selectAllSpecies}>
                <Text style={styles.actionText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAllSpecies}>
                <Text style={styles.actionText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.speciesScroll}>
              {allSpeciesOptions.map((species) => {
                const isSelected = selectedSpecies.has(species);
                return (
                  <TouchableOpacity
                    key={species}
                    style={styles.speciesItem}
                    onPress={() => toggleSpecies(species)}
                  >
                    <View style={styles.speciesItemContent}>
                      <Image 
                        source={speciesImageMap[species] || placeholderImage} 
                        style={styles.speciesItemImage} 
                      />
                      <Text style={styles.speciesItemText}>{species}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={20} color="#2d3e34" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.speciesPickerActions}>
              <Text style={styles.selectedCountText}>
                {selectedSpecies.size} of {allSpeciesOptions.length} selected
              </Text>
              <TouchableOpacity 
                style={styles.applyButton}
                onPress={() => setShowSpeciesPicker(false)}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2d3e34',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '500',
    color: '#ccff00',
  },
  menuButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    flex: 1,
  },
  customMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterButton: {
    flex: 1,
    backgroundColor: '#2d3e34',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#ccff00',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 80,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  selectedCard: {
    position: 'absolute',
    bottom: 625,
    right: 56,
    backgroundColor: '#2d3e34',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  selectedCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 150,
  },
  selectedCardLeft: {
    flex: 1,
  },
  speciesTag: {
    backgroundColor: '#d4ff00',
    paddingHorizontal: 2,
    paddingVertical: 2,
    width: 130,
    height: 30,
    borderRadius: 8,
    alignSelf: 'flex-start'
  },
  speciesTagText: {
    fontSize: 18,
    alignSelf: 'center',
    fontWeight: '700',
    color: '#2d3e34',
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  selectedCardImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  expandedModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  expandedCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2d3e34',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  expandedHeader: {
    backgroundColor: '#3d4f44',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 12,
  },
  expandedHeaderTop: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    marginLeft: 20,
  },
  expandedHeaderContent: {
    flexDirection: "row",
    alignItems: 'flex-start',
    paddingTop: 3,
    gap: 8,
  },
  statusIcon: {
    marginRight: 3,
  },
  locationText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginRight: 4
  },
  expandedHeaderImage: {
    width: 100,
    height: 60,
    borderRadius: 12,
    marginRight: 2,
  },
  expandedContent: {
    padding: 16,
  },
  dateEditRow: {
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
    backgroundColor: '#1e1e1eff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  dropdownText: {
    fontSize: 16,
    color: '#fff',
  },
  dropdownMenu: {
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    marginBottom: 12,
    maxHeight: 250,
    borderWidth: 2,
    borderColor: '#d4ff00',
  },
  dropdownScroll: {
    maxHeight: 250,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d3e34',
    gap: 12,
  },
  dropdownItemImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
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
    fontSize: 18,
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
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModal: {
    backgroundColor: '#2d3e34',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  speciesPickerModal: {
    backgroundColor: '#2d3e34',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#3d4f44',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  selectedDatesContainer: {
    padding: 16,
    backgroundColor: '#3d4f44',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
  },
  selectedDateText: {
    fontSize: 16,
    color: '#d4ff00',
    marginBottom: 4,
  },
  calendarHeader: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  weekDaysRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#d4ff00',
  },
  calendarScroll: {
    maxHeight: 350,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
  },
  emptyDay: {
    width: '14.28%',
    aspectRatio: 1,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  selectedDay: {
    backgroundColor: '#d4ff00',
    borderRadius: 8,
  },
  rangeDay: {
    backgroundColor: 'rgba(212, 255, 0, 0.3)',
  },
  dayText: {
    fontSize: 16,
    color: '#fff',
  },
  selectedDayText: {
    color: '#2d3e34',
    fontWeight: '700',
  },
  todayText: {
    color: '#4db8e8',
    fontWeight: '600',
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#3d4f44',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  applyButton: {
    flex: 1,
    backgroundColor: '#d4ff00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    color: '#2d3e34',
    fontWeight: '700',
  },
  speciesActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#d4ff00',
    fontWeight: '500',
  },
  speciesScroll: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  speciesItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3d4f44',
  },
  speciesItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  speciesItemImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  speciesItemText: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d4ff00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#d4ff00',
  },
  speciesPickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  selectedCountText: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
  },
});