import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { portalAPI } from '../api';
import * as SecureStore from 'expo-secure-store';

export default function DeliveryCameraScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
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
    setUploading(true);
    try {
      const agentDataStr = await SecureStore.getItemAsync('agentData');
      const agent = JSON.parse(agentDataStr);
      
      // Assume OTP verified already for this demo, just uploading POD to complete
      await portalAPI.verifyDelivery(agent.id, orderId, '1234', `data:image/jpeg;base64,${photo.base64}`);
      
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
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#ef4444' }]} onPress={() => setPhoto(null)}>
              <Text style={styles.btnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#10b981' }]} onPress={uploadPOD} disabled={uploading}>
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
  actions: { flexDirection: 'row', gap: 20 },
  btn: { padding: 16, borderRadius: 8, alignItems: 'center', minWidth: 120 },
  btnText: { color: '#fff', fontWeight: 'bold' }
});
