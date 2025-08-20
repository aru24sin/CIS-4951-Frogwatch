import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

interface Recording {
  recordingId: string;
  userId: string;
  species: string;
  predictedSpecies: string;
  audioURL: string;
  location: {
    latitude: number;
    longitude: number;
  };
  status: string;
  timestamp: string;
  confidence?: number;
}

const speciesImageMap: { [key: string]: string } = {
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

const HistoryScreen = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    const fetchDummyData = async () => {
      const dummy: Recording[] = [
        {
          recordingId: 'rec1',
          userId: 'test',
          species: 'Bullfrog',
          predictedSpecies: 'Bullfrog',
          audioURL: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          location: { latitude: 42.3314, longitude: -83.0458 },
          status: 'confirmed',
          timestamp: '',
          confidence: 92,
        },
        {
          recordingId: 'rec2',
          userId: 'test',
          species: 'Green Treefrog',
          predictedSpecies: 'Green Treefrog',
          audioURL: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
          location: { latitude: 42.343, longitude: -83.049 },
          status: 'pending',
          timestamp: '',
          confidence: 87,
        },
      ];
      setRecordings(dummy);
      setLoading(false);
    };

    fetchDummyData();
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, []);

  const handlePlay = async (uri: string) => {
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (error) {
      console.error('Audio play error:', error);
    }
  };

  const handleSelect = (recording: Recording) => {
    setSelectedId(recording.recordingId);
    mapRef.current?.animateToRegion({
      ...recording.location,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
  };

  const renderItem = ({ item }: { item: Recording }) => {
    const image = speciesImageMap[item.predictedSpecies] || placeholderImage;

    return (
      <TouchableOpacity onPress={() => handleSelect(item)}>
        <View
          style={[
            styles.card,
            selectedId === item.recordingId && { borderColor: '#FF9500', borderWidth: 2 },
          ]}
        >
          <Image source={image} style={styles.image} />
          <Text style={styles.title}>{item.predictedSpecies}</Text>
          <Text>Confidence: {item.confidence ?? 'N/A'}%</Text>
          <Text>
            Location: {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => handlePlay(item.audioURL)}>
            <Text style={styles.buttonText}>Play / Replay</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) return <ActivityIndicator size="large" style={{ marginTop: 50 }} />;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ height: 300 }}
        initialRegion={{
          latitude: recordings[0]?.location.latitude || 0,
          longitude: recordings[0]?.location.longitude || 0,
          latitudeDelta: 5,
          longitudeDelta: 5,
        }}
      >
        {recordings.map((rec) => (
          <Marker
            key={rec.recordingId}
            coordinate={rec.location}
            title={rec.predictedSpecies}
            description={`Confidence: ${rec.confidence ?? 'N/A'}%`}
            pinColor={rec.recordingId === selectedId ? 'orange' : 'red'}
          />
        ))}
      </MapView>

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.recordingId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f0f8ff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginVertical: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default HistoryScreen;
