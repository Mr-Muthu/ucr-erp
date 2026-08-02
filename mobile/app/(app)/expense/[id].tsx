import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { dutyActions } from '../../../src/sync/dutyActions';
import { uploadPhoto } from '../../../src/sync/photoUpload';
import { useSync } from '../../../src/sync/SyncContext';
import { Button, Field, Input } from '../../../src/ui/components';
import { colors } from '../../../src/ui/theme';

const ENTRY_TYPES = ['TOLL', 'PARKING', 'OTHER'] as const;

export default function AddExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { triggerSync } = useSync();
  const [type, setType] = useState<(typeof ENTRY_TYPES)[number]>('TOLL');
  const [amount, setAmount] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  async function onSubmit() {
    setError('');
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      let receiptPhotoKey: string | undefined;
      if (photoUri) receiptPhotoKey = (await uploadPhoto(photoUri, 'DUTY_RECEIPT')) ?? undefined;
      await dutyActions.addEntry(id, { entryType: type, amount: value, receiptPhotoKey });
      triggerSync();
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, backgroundColor: colors.white, flexGrow: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.slate900, marginBottom: 20 }}>Add Expense</Text>

      <Field label="Type">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ENTRY_TYPES.map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: type === t ? colors.brand600 : colors.slate100,
              }}
            >
              <Text style={{ color: type === t ? colors.white : colors.slate700, fontWeight: '700', fontSize: 13 }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Amount (₹)" error={error || undefined}>
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 120" />
      </Field>

      <Field label="Receipt photo (optional)">
        {photoUri ? <Image source={{ uri: photoUri }} style={{ width: '100%', height: 160, borderRadius: 10, marginBottom: 10 }} /> : null}
        <Button title={photoUri ? 'Retake photo' : 'Take photo'} variant="secondary" onPress={takePhoto} />
      </Field>

      <View style={{ marginTop: 12, gap: 10 }}>
        <Button title="Add Expense" onPress={onSubmit} loading={busy} />
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
