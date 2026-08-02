import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSync } from '../sync/SyncContext';
import { colors } from './theme';

export function SyncStatusBar() {
  const { pendingCount, syncing, isOnline, triggerSync } = useSync();

  return (
    <Pressable
      onPress={triggerSync}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: isOnline ? (pendingCount > 0 ? colors.amber100 : colors.slate50) : colors.red100,
        borderBottomWidth: 1,
        borderBottomColor: colors.slate200,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: isOnline ? colors.emerald700 : colors.red600,
          }}
        />
        <Text style={{ fontSize: 12, color: colors.slate700, fontWeight: '600' }}>
          {isOnline ? 'Online' : 'Offline — saving locally'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {syncing ? <ActivityIndicator size="small" color={colors.brand600} /> : null}
        <Text style={{ fontSize: 12, color: colors.slate600 }}>
          {pendingCount > 0 ? `${pendingCount} pending sync` : 'All synced'}
        </Text>
      </View>
    </Pressable>
  );
}
