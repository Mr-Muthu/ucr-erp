import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { dutyActions } from '../../../src/sync/dutyActions';
import { useSync } from '../../../src/sync/SyncContext';
import { Button, Field, Input } from '../../../src/ui/components';
import { colors } from '../../../src/ui/theme';

export default function AddNightHalt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { triggerSync } = useSync();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    try {
      await dutyActions.addNightHalt(id, { haltDate: new Date().toISOString(), notes: notes.trim() || undefined });
      triggerSync();
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, backgroundColor: colors.white, flexGrow: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.slate900, marginBottom: 4 }}>Add Night Halt</Text>
      <Text style={{ fontSize: 13, color: colors.slate500, marginBottom: 20 }}>Recorded for today, {new Date().toLocaleDateString('en-IN')}.</Text>

      <Field label="Notes (optional)">
        <Input value={notes} onChangeText={setNotes} placeholder="e.g. Halted at Kolhapur" multiline />
      </Field>

      <View style={{ marginTop: 12, gap: 10 }}>
        <Button title="Add Night Halt" onPress={onSubmit} loading={busy} />
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
