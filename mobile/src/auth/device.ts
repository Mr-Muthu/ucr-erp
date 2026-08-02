import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import type { DriverDevice } from '../api/types';

const DEVICE_ID_KEY = 'ucr_driver_client_device_id';

/** Generated once per install and persisted — stable across logins, per the driver-device-bound auth model. */
export async function getClientDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function getDeviceInfo(): Promise<DriverDevice> {
  const clientDeviceId = await getClientDeviceId();
  return {
    clientDeviceId,
    deviceModel: Device.modelName ?? undefined,
    appVersion: Application.nativeApplicationVersion ?? undefined,
    osVersion: Platform.OS === 'ios' ? Device.osVersion ?? undefined : Device.osVersion ?? undefined,
  };
}
