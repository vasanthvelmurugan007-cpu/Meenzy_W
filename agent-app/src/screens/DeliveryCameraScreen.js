import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { portalAPI } from '../api';
import * as SecureStore from 'expo-secure-store';

export default function DeliveryCameraScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [otp, setOtp] = useState('');
  const cameraRef = useRef(null);

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: 'center', marginBottom: 20 }}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePic = async () => {
    if (cameraRef.current) {
      const p = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      setPhoto(p);
    }
  };

  const uploadPOD = async () => {
    if (!otp || otp.trim().length !== 4) {
      Alert.alert('Error', 'Please enter a valid 4-digit OTP');
      return;
    }
    setUploading(true);
    try {
      const agentDataStr = await SecureStore.getItemAsync('agentData');
      const agent = JSON.parse(agentDataStr);
      
      await portalAPI.verifyDelivery(agent.id, orderId, otp.trim(), `data:image/jpeg;base64,${photo.base64}`);
      
      Alert.alert('Success', 'Delivery completed and POD uploaded!');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Upload Failed', err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {!photo ? (
        <CameraView style={styles.camera} ref={cameraRef}>
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.captureBtn} onPress={takePic} />
          </View>
        </CameraView>
      ) : (
        <View style={styles.previewContainer}>
          <Text style={styles.title}>Proof of Delivery Captured</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Enter 4-Digit OTP"
            placeholderTextColor="#9ca3af"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={4}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#ef4444' }]} onPress={() => { setPhoto(null); setOtp(''); }}>
              <Text style={styles.btnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.btn, { backgroundColor: '#10b981' }, (uploading || otp.trim().length !== 4) && { opacity: 0.5 }]} 
              onPress={uploadPOD} 
              disabled={uploading || otp.trim().length !== 4}
            >
              <Text style={styles.btnText}>{uploading ? 'Uploading...' : 'Confirm Delivery'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  camera: { flex: 1 },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingBottom: 40,
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#d1d5db',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: {
    width: '80%',
    height: 50,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  actions: { flexDirection: 'row', gap: 20 },
  btn: { padding: 16, borderRadius: 8, alignItems: 'center', minWidth: 120 },
  btnText: { color: '#fff', fontWeight: 'bold' }
});
