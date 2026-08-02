import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { useSync } from '../../src/sync/SyncContext';
import { getCachedDuties } from '../../src/db/dutiesCache';
import { SyncStatusBar } from '../../src/ui/SyncStatusBar';
import { Badge, Button, Card, PlateBadge } from '../../src/ui/components';
import { colors } from '../../src/ui/theme';
import { formatDateTime } from '../../src/ui/format';
import type { Duty } from '../../src/api/types';

export default function Duties() {
  const { driver, logout } = useAuth();
  const { triggerSync, syncing } = useSync();
  const router = useRouter();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setDuties(await getCachedDuties());
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function onRefresh() {
    await triggerSync();
    await reload();
  }

  const active = duties.filter((d) => !['DECLINED', 'BILLED', 'SUBMITTED', 'APPROVED', 'RESOLVED'].includes(d.status));
  const history = duties.filter((d) => ['DECLINED', 'BILLED', 'SUBMITTED', 'APPROVED', 'RESOLVED'].includes(d.status));

  return (
    <View style={{ flex: 1, backgroundColor: colors.slate50 }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.white }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.slate900 }}>My Duties</Text>
            <Text style={{ fontSize: 13, color: colors.slate500 }}>{driver?.name}</Text>
          </View>
          <Button title="Log out" variant="secondary" onPress={logout} />
        </View>
      </View>
      <SyncStatusBar />

      <FlatList
        data={[...active, ...history]}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loaded ? (
            <Text style={{ textAlign: 'center', color: colors.slate400, marginTop: 40 }}>
              No duties yet. Pull down to refresh.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Card>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}
            >
              <PlateBadge value={item.vehicle.registrationNumber} />
              <Badge value={item.status} />
            </View>
            {item.booking?.pickupLocation ? (
              <Text style={{ fontSize: 14, color: colors.slate700, marginBottom: 2 }} numberOfLines={1}>
                {item.booking.pickupLocation}
                {item.booking.dropLocation ? ` → ${item.booking.dropLocation}` : ''}
              </Text>
            ) : null}
            <Text style={{ fontSize: 13, color: colors.slate500, marginBottom: 12 }}>
              {formatDateTime(item.scheduledStart)}
            </Text>
            <Button title="View duty" variant="secondary" onPress={() => router.push(`/(app)/duty/${item.id}`)} />
          </Card>
        )}
      />
    </View>
  );
}
