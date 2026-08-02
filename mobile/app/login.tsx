import { useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';
import { extractApiError } from '../src/api/client';
import { Button, Field, Input } from '../src/ui/components';
import { colors } from '../src/ui/theme';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError('');
    setLoading(true);
    try {
      await login(phone.trim(), pin.trim());
      router.replace('/(app)/duties');
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.slate900, textAlign: 'center' }}>
          UCR <Text style={{ color: colors.brand600 }}>Driver</Text>
        </Text>
        <Text style={{ fontSize: 14, color: colors.slate500, textAlign: 'center', marginTop: 4, marginBottom: 32 }}>
          Ulagammal Car Rental — Driver App
        </Text>

        <Field label="Phone number">
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98XXXXXXXX" autoCapitalize="none" />
        </Field>
        <Field label="PIN" error={error || undefined}>
          <Input value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry placeholder="••••" maxLength={8} />
        </Field>

        <Button title="Sign in" onPress={onSubmit} loading={loading} disabled={!phone || !pin} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
