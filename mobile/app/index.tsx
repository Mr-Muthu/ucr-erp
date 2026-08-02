import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';
import { colors } from '../src/ui/theme';

export default function Index() {
  const { driver, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.brand600} size="large" />
      </View>
    );
  }

  return <Redirect href={driver ? '/(app)/duties' : '/login'} />;
}
