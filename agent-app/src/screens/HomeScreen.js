import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Linking } from 'react-native';
import Mapbox from '@rnmapbox/maps';
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);
import * as SecureStore from 'expo-secure-store';
import { useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import { portalAPI } from '../api';
import { startBackgroundLocation } from '../services/LocationService';
import { Navigation, Phone, CheckCircle, Package } from 'lucide-react-native';

export default function HomeScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  useEffect(() => {
    startBackgroundLocation();
  }, []);

  const loadData = async () => {
    try {
      const agentStr = await SecureStore.getItemAsync('agentData');
      if (agentStr) {
        const a = JSON.parse(agentStr);
        setAgent(a);
        const res = await portalAPI.getOrders(a.id);
        setOrders(res.data.orders || []);
      }
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401 || err.message?.includes('401')) {
        Alert.alert('Session Expired', 'Please log in again.');
        await SecureStore.deleteItemAsync('agentToken');
        await SecureStore.deleteItemAsync('agentData');
        navigation.replace('Login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOptimizeRoute = async () => {
    if (orders.length < 2) return;
    setOptimizing(true);
    try {
      let currentLat = null;
      let currentLng = null;
      try {
        const loc = await Location.getLastKnownPositionAsync({});
        if (loc) {
          currentLat = loc.coords.latitude;
          currentLng = loc.coords.longitude;
        }
      } catch (locErr) {
        console.warn('Failed to get location for optimization', locErr);
      }

      const res = await portalAPI.optimizeRoute(agent.id, {
        currentLat,
        currentLng,
        orders
      });

      if (res.data && res.data.ok && res.data.sequence) {
        const sequence = res.data.sequence;
        const sorted = [...orders].sort((a, b) => {
          const idxA = sequence.indexOf(a.id);
          const idxB = sequence.indexOf(b.id);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        setOrders(sorted);
        Alert.alert('Route Optimized', 'AI has successfully optimized your delivery sequence!');
      } else {
        Alert.alert('Optimization Failed', 'Could not optimize delivery sequence.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'An error occurred during route optimization.');
    } finally {
      setOptimizing(false);
    }
  };

  const handleStartRoute = async () => {
    if (orders.length === 0) return;
    setOptimizing(true);
    try {
      let currentLat = null;
      let currentLng = null;
      try {
        const loc = await Location.getLastKnownPositionAsync({});
        if (loc) {
          currentLat = loc.coords.latitude;
          currentLng = loc.coords.longitude;
        }
      } catch (locErr) {
        console.warn('Failed to get location for route', locErr);
      }

      try {
        await portalAPI.startRoute(agent.id, { orders });
      } catch (err) {
        console.error('Failed to trigger WhatsApp templates on route start:', err);
      }

      const lastOrder = orders[orders.length - 1];
      const destination = lastOrder.lat && lastOrder.lng ? `&destination=${lastOrder.lat},${lastOrder.lng}` : '';
      const origin = currentLat && currentLng ? `&origin=${currentLat},${currentLng}` : '';
      const waypoints = orders.slice(0, -1).filter(o => o.lat && o.lng).map(o => `${o.lat},${o.lng}`).join('|');
      
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1${origin}${destination}${waypoints ? `&waypoints=${waypoints}` : ''}`;
      
      await Linking.openURL(googleMapsUrl);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not open navigation map.');
    } finally {
      setOptimizing(false);
    }
  };

  const renderOrder = ({ item }) => (
    <View style={styles.orderCard}>
      <Text style={styles.orderId}>Order #{item.id.slice(-6)}</Text>
      <Text style={styles.orderAddress}>{item.address_line}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('DeliveryCamera', { orderId: item.id })}>
          <CheckCircle size={16} color="#fff" />
          <Text style={styles.btnText}>Deliver</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera zoomLevel={12} centerCoordinate={[77.5946, 12.9716]} />
        {orders.map(order => order.lng && order.lat && (
          <Mapbox.PointAnnotation key={order.id} id={order.id} coordinate={[parseFloat(order.lng), parseFloat(order.lat)]}>
            <View style={{ width: 20, height: 20, backgroundColor: '#ef4444', borderRadius: 10, borderColor: '#fff', borderWidth: 2 }} />
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>My Deliveries ({orders.length})</Text>

        {orders.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#8b5cf6' }]} 
              onPress={handleOptimizeRoute}
              disabled={optimizing}
            >
              <Text style={styles.actionBtnText}>{optimizing ? 'Analyzing...' : 'Optimize'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#3b82f6' }]} 
              onPress={handleStartRoute}
              disabled={optimizing}
            >
              <Text style={styles.actionBtnText}>Start driving</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          renderItem={renderOrder}
          ListEmptyComponent={<Text style={{padding: 20, color: '#6b7280'}}>No pending deliveries</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  map: { flex: 1 },
  bottomSheet: {
    height: 350,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
    marginTop: -24,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16, color: '#1f2937' },
  orderCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#f9fafb',
  },
  orderId: { fontWeight: '800', fontSize: 16, color: '#1f2937' },
  orderAddress: { color: '#6b7280', marginVertical: 8, fontSize: 14 },
  actions: { flexDirection: 'row', marginTop: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnText: { color: '#fff', marginLeft: 8, fontWeight: '700', fontSize: 14 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  }
});
