import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RecordScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      setTimer(0); // reset timer when recording starts
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FrogWatch+ Recorder</Text>
      <Text style={styles.status}>{isRecording ? 'Recording...' : 'Press to Start'}</Text>
      <Text style={styles.timer}>{formatTime(timer)}</Text>

      {/* Mic Button */}
      <TouchableOpacity onPress={toggleRecording} style={styles.micButton}>
        <Ionicons
          name={isRecording ? 'stop-circle' : 'mic-circle'}
          size={100}
          color={isRecording ? '#d9534f' : '#5cb85c'}
        />
      </TouchableOpacity>

      {/* Optional: Waveform animation can go here */}
      <View style={styles.waveformPlaceholder}>
        <Text style={{ color: '#888' }}>[Waveform Animation Placeholder]</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  status: {
    fontSize: 18,
    marginBottom: 10,
  },
  timer: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 20,
  },
  micButton: {
    marginBottom: 30,
  },
  waveformPlaceholder: {
    marginTop: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
  },
});
