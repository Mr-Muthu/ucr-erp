import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { ReactNode } from 'react';
import { colors, statusTone } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ value }: { value: string }) {
  const tone = statusTone[value] ?? { bg: colors.slate200, fg: colors.slate700 };
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{value.replaceAll('_', ' ')}</Text>
    </View>
  );
}

export function PlateBadge({ value }: { value: string }) {
  return (
    <View style={styles.plate}>
      <Text style={styles.plateText}>{value}</Text>
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const bg = variant === 'primary' ? colors.brand600 : variant === 'danger' ? colors.red600 : colors.white;
  const fg = variant === 'secondary' ? colors.slate700 : colors.white;
  const border = variant === 'secondary' ? colors.slate300 : bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput {...props} style={[styles.input, props.style]} placeholderTextColor={colors.slate400} />;
}

export function Money({ value }: { value: string | number | null | undefined }) {
  const n = Number(value ?? 0);
  return <Text style={styles.money}>₹{n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: 16,
    marginBottom: 12,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  plate: {
    borderWidth: 2,
    borderColor: colors.slate800,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  plateText: { fontFamily: 'System', fontWeight: '800', letterSpacing: 1, color: colors.slate900, fontSize: 13 },
  button: { borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate600, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.slate900,
    backgroundColor: colors.white,
  },
  error: { color: colors.red600, fontSize: 12, marginTop: 4 },
  money: { fontVariant: ['tabular-nums'], fontWeight: '700', color: colors.slate900 },
});
