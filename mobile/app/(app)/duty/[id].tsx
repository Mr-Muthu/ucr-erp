import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { getCachedDuty } from '../../../src/db/dutiesCache';
import { dutyActions } from '../../../src/sync/dutyActions';
import { useSync } from '../../../src/sync/SyncContext';
import { SyncStatusBar } from '../../../src/ui/SyncStatusBar';
import { Badge, Button, Card, Field, Input, PlateBadge } from '../../../src/ui/components';
import { colors } from '../../../src/ui/theme';
import { formatDateTime } from '../../../src/ui/format';
import type { Duty } from '../../../src/api/types';

export default function DutyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { triggerSync } = useSync();
  const [duty, setDuty] = useState<Duty | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (id) setDuty(await getCachedDuty(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await reload();
      triggerSync();
    } finally {
      setBusy(false);
    }
  }

  if (!duty) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.slate400 }}>Duty not found locally — pull to refresh on the list screen.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.white }}>
        <Button title="← Back" variant="secondary" onPress={() => router.back()} />
      </View>
      <SyncStatusBar />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <PlateBadge value={duty.vehicle.registrationNumber} />
            <Badge value={duty.status} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.slate900 }}>
            {duty.vehicle.make} {duty.vehicle.model}
          </Text>
          <Text style={{ fontSize: 13, color: colors.slate500, marginTop: 4 }}>Scheduled: {formatDateTime(duty.scheduledStart)}</Text>
          {duty.booking?.pickupLocation ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 13, color: colors.slate600 }}>Pickup: {duty.booking.pickupLocation}</Text>
              {duty.booking.dropLocation ? (
                <Text style={{ fontSize: 13, color: colors.slate600 }}>Drop: {duty.booking.dropLocation}</Text>
              ) : null}
            </View>
          ) : null}
          {duty.passengerName ? <Text style={{ fontSize: 13, color: colors.slate600, marginTop: 6 }}>Passenger: {duty.passengerName}</Text> : null}
          {duty.routeRemarks ? <Text style={{ fontSize: 13, color: colors.slate600, marginTop: 2 }}>Remarks: {duty.routeRemarks}</Text> : null}
        </Card>

        {duty.status === 'REJECTED' && duty.rejectionReason ? (
          <Card style={{ backgroundColor: colors.red100, borderColor: colors.red100 }}>
            <Text style={{ color: colors.red700, fontWeight: '700', marginBottom: 4 }}>Sent back by Ops</Text>
            <Text style={{ color: colors.red700 }}>{duty.rejectionReason}</Text>
          </Card>
        ) : null}
        {duty.status === 'DISPUTED' && duty.disputeReason ? (
          <Card style={{ backgroundColor: colors.red100, borderColor: colors.red100 }}>
            <Text style={{ color: colors.red700, fontWeight: '700', marginBottom: 4 }}>Disputed</Text>
            <Text style={{ color: colors.red700 }}>{duty.disputeReason}</Text>
          </Card>
        ) : null}

        {duty.status === 'ASSIGNED' && !declining && (
          <View style={{ gap: 10 }}>
            <Button title="Accept Duty" loading={busy} onPress={() => withBusy(() => dutyActions.accept(duty.id).then(() => {}))} />
            <Button title="Decline" variant="secondary" onPress={() => setDeclining(true)} />
          </View>
        )}
        {duty.status === 'ASSIGNED' && declining && (
          <Card>
            <Field label="Reason for declining">
              <Input value={reason} onChangeText={setReason} placeholder="e.g. vehicle breakdown" multiline />
            </Field>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="secondary" onPress={() => setDeclining(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Confirm decline"
                  variant="danger"
                  disabled={reason.trim().length < 3}
                  loading={busy}
                  onPress={() => withBusy(() => dutyActions.decline(duty.id, reason.trim()).then(() => {}))}
                />
              </View>
            </View>
          </Card>
        )}

        {duty.status === 'ACCEPTED' && (
          <Button title="Start Duty" onPress={() => router.push(`/(app)/start/${duty.id}`)} />
        )}

        {duty.status === 'STARTED' && (
          <View style={{ gap: 10 }}>
            <Button title="Complete Duty" onPress={() => router.push(`/(app)/complete/${duty.id}`)} />
            <Button title="Add Expense" variant="secondary" onPress={() => router.push(`/(app)/expense/${duty.id}`)} />
            <Button title="Add Night Halt" variant="secondary" onPress={() => router.push(`/(app)/night-halt/${duty.id}`)} />
          </View>
        )}

        {duty.status === 'COMPLETED' && (
          <Button title="Submit Duty" loading={busy} onPress={() => withBusy(() => dutyActions.submit(duty.id).then(() => {}))} />
        )}

        {duty.status === 'REJECTED' && (
          <Button title="Resubmit" loading={busy} onPress={() => withBusy(() => dutyActions.resubmit(duty.id).then(() => {}))} />
        )}

        {['SUBMITTED', 'APPROVED', 'RESOLVED', 'BILLED', 'DECLINED', 'DISPUTED'].includes(duty.status) && (
          <Text style={{ textAlign: 'center', color: colors.slate400, marginTop: 8 }}>
            No action needed — this duty is with Ops.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
