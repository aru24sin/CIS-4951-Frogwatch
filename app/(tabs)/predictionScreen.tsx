import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const speciesImageMap: { [key: string]: string } = {
  'American Bullfrog': require('../../assets/frogs/bullfrog.png'),
  'Green Treefrog': require('../../assets/frogs/treefrog.png'),
  'Spring Peeper': require('../../assets/frogs/spring_peeper.png'),
  'Northern Leopard Frog': require('../../assets/frogs/northern_leopard.png'),
  'Gray Treefrog': require('../../assets/frogs/gray_treefrog.png'),
  // Add more mappings as needed
};

const placeholderImage = require('../../assets/frogs/placeholder.png');

const PredictionScreen = () => {
  const { audioUri, latitude, longitude } = useLocalSearchParams();

  const location = {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [predictedSpecies, setPredictedSpecies] = useState('American Bullfrog');
  const [confidence, setConfidence] = useState('');

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const handlePlay = async () => {
    try {
      if (sound) {
        await sound.replayAsync();
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUri as string },
          { shouldPlay: true }
        );
        setSound(newSound);
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  const handleSubmit = () => {
    const score = parseInt(confidence);
    if (isNaN(score) || score < 0 || score > 100) {
      Alert.alert('Invalid Confidence Score', 'Please enter an integer between 0 and 100.');
      return;
    }

    const data = {
      species: predictedSpecies,
      confidence: score,
      location,
    };

    console.log('Submitting prediction data:', data);
    Alert.alert('Submitted', 'Your data has been submitted.');
  };

  const speciesImage = speciesImageMap[predictedSpecies] || placeholderImage;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={speciesImage} style={styles.image} resizeMode="contain" />
      <Text style={styles.speciesName}>{predictedSpecies}</Text>

      <TouchableOpacity style={styles.actionButton} onPress={handlePlay}>
        <Text style={styles.actionButtonText}>Play Recording</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Confirm Species:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={predictedSpecies}
          onValueChange={(itemValue) => setPredictedSpecies(itemValue)}
          style={styles.picker}
        >
          {Object.keys(speciesImageMap).map((species) => (
            <Picker.Item key={species} label={species} value={species} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Confidence Score (0–100):</Text>
      <TextInput
        style={styles.input}
        value={confidence}
        onChangeText={setConfidence}
        placeholder="e.g. 85"
        keyboardType="number-pad"
      />

      <TouchableOpacity style={styles.actionButton} onPress={handleSubmit}>
        <Text style={styles.actionButtonText}>Submit</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e6f9e1',
    alignItems: 'center',
    padding: 40,
    flexGrow: 1,
  },
  image: {
    width: 300,
    height: 200,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#66bb6a',
  },
  speciesName: {
    fontSize: 30,
    fontWeight: '600',
    marginBottom: 30,
  },
  label: {
    marginTop: 20,
    fontWeight: 'bold',
    alignSelf: 'flex-start',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
    width: '100%',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginVertical: 10,
    width: '100%',
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    height: 60,
  },
  actionButton: {
    backgroundColor: '#66bb6a',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 15,
    width: '100%',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PredictionScreen;
