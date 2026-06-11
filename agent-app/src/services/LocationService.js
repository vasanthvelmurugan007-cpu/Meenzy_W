import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { portalAPI } from '../api';
import * as SecureStore from 'expo-secure-store';

export const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background Location Error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const loc = locations[0];
    if (loc) {
      try {
        const agentDataStr = await SecureStore.getItemAsync('agentData');
        if (agentDataStr) {
          const agent = JSON.parse(agentDataStr);
          await portalAPI.updateLocation(agent.id, loc.coords.latitude, loc.coords.longitude);
        }
      } catch (err) {
        console.error('Failed to sync background location', err);
      }
    }
  }
});

export const startBackgroundLocation = async () => {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus === 'granted') {
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus === 'granted') {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
        distanceInterval: 10,
        deferredUpdatesInterval: 10000,
        showsBackgroundLocationIndicator: true,
      });
    }
  }
};

export const stopBackgroundLocation = async () => {
  const hasTask = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (hasTask) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
};
