import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image, ScrollView, Text, View } from 'react-native';
import { dutyActions } from '../../../src/sync/dutyActions';
import { uploadPhoto } from '../../../src/sync/photoUpload';
import { useSync } from '../../../src/sync/SyncContext';
import { Button, Field, Input } from '../../../src/ui/components';
import { colors } from '../../../src/ui/theme';

export default function StartDuty() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { triggerSync } = useSync();
  const [odometer, setOdometer] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is needed for the odometer photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function onSubmit() {
    setError('');
    const value = Number(odometer);
    if (!odometer || Number.isNaN(value) || value < 0) {
      setError('Enter a valid odometer reading.');
      return;
    }
    setBusy(true);
    try {
      let openingOdometerPhotoKey: string | undefined;
      if (photoUri) {
        // Best-effort — a failed/offline photo upload never blocks starting the duty.
        openingOdometerPhotoKey = (await uploadPhoto(photoUri, 'DUTY_ODOMETER_PHOTO')) ?? undefined;
      }
      await dutyActions.start(id, {
        deviceStartAt: new Date().toISOString(),
        openingOdometer: value,
        openingOdometerPhotoKey,
      });
      triggerSync();
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, backgroundColor: colors.white, flexGrow: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.slate900, marginBottom: 4 }}>Start Duty</Text>
      <Text style={{ fontSize: 13, color: colors.slate500, marginBottom: 20 }}>Capture the opening odometer reading.</Text>

      <Field label="Opening odometer (km)" error={error || undefined}>
        <Input value={odometer} onChangeText={setOdometer} keyboardType="number-pad" placeholder="e.g. 45210" />
      </Field>

      <Field label="Odometer photo (optional)">
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 10 }} />
        ) : null}
        <Button title={photoUri ? 'Retake photo' : 'Take photo'} variant="secondary" onPress={takePhoto} />
      </Field>

      <View style={{ marginTop: 12, gap: 10 }}>
        <Button title="Start Duty" onPress={onSubmit} loading={busy} />
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
