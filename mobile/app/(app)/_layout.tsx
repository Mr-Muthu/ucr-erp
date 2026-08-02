import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { SyncProvider } from '../../src/sync/SyncContext';
import { colors } from '../../src/ui/theme';

export default function AppLayout() {
  const { driver, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand600} size="large" />
      </View>
    );
  }
  if (!driver) return <Redirect href="/login" />;

  return (
    <SyncProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="duties" />
        <Stack.Screen name="duty/[id]" />
        <Stack.Screen name="start/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="complete/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="night-halt/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </SyncProvider>
  );
}
