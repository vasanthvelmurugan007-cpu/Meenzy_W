import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import Mapbox from '@rnmapbox/maps';
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);
import * as SecureStore from 'expo-secure-store';
import { portalAPI } from '../api';
import { startBackgroundLocation } from '../services/LocationService';
import { Navigation, Phone, CheckCircle, Package } from 'lucide-react-native';

export default function HomeScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
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
    } finally {
      setLoading(false);
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
  btnText: { color: '#fff', marginLeft: 8, fontWeight: '700', fontSize: 14 }
});
