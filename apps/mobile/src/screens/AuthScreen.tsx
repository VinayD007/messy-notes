import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DarkMessNoteColors, MessNoteMetrics, MessNoteTypography } from '@messy-notes/shared';
import { useAuthStore } from '../store/authStore';

export function AuthScreen() {
  const { signIn, signUp, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setInfoMessage(null);
    clearError();

    if (mode === 'signin') {
      await signIn(email, password).catch(() => undefined);
      return;
    }

    const result = await signUp(email, password).catch(() => null);
    if (result?.needsEmailConfirmation) {
      setInfoMessage('Check your email to confirm your account before signing in.');
    }
  };

  return (
    <KeyboardAvoidingView behavior="height" style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.brandIcon}
          />
          <Text style={styles.title}>MessyNotes</Text>
          <Text style={styles.subtitle}>
            Calm, offline-first notes with real-time Supabase sync
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={DarkMessNoteColors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={styles.input}
            placeholder="Password (min 6 chars)"
            placeholderTextColor={DarkMessNoteColors.textMuted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {infoMessage ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{infoMessage}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              loading && styles.disabledBtn,
              pressed && { opacity: 0.88 },
            ]}
            disabled={loading}
            onPress={() => void handleSubmit()}
          >
            {loading ? (
              <ActivityIndicator color={DarkMessNoteColors.onAccent} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.72 }]}
            onPress={() => {
              clearError();
              setInfoMessage(null);
              setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
            }}
          >
            <Text style={styles.linkText}>
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DarkMessNoteColors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: DarkMessNoteColors.surfaceCard,
    borderRadius: MessNoteMetrics.dialogCornerRadius,
    padding: 26,
    borderWidth: 1,
    borderColor: DarkMessNoteColors.outlineVariant,
    gap: 14,
  },
  brandIcon: {
    width: 68,
    height: 68,
    borderRadius: 18,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    color: DarkMessNoteColors.textPrimary,
    ...MessNoteTypography.displayHeadline,
    textAlign: 'center',
  },
  subtitle: {
    color: DarkMessNoteColors.textSecondary,
    ...MessNoteTypography.bodyMedium,
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: DarkMessNoteColors.surfaceElevated,
    borderColor: DarkMessNoteColors.outlineVariant,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    color: DarkMessNoteColors.textPrimary,
    ...MessNoteTypography.bodyLarge,
  },
  primaryBtn: {
    backgroundColor: DarkMessNoteColors.noteBubbleAccent,
    borderRadius: 999,
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: DarkMessNoteColors.onAccent,
    ...MessNoteTypography.labelLarge,
    fontWeight: '700',
  },
  linkBtn: {
    borderRadius: 999,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    color: DarkMessNoteColors.textPrimary,
    ...MessNoteTypography.labelLarge,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 69, 58, 0.14)',
    borderColor: DarkMessNoteColors.destructiveAction,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    color: DarkMessNoteColors.destructiveAction,
    ...MessNoteTypography.bodyMedium,
  },
  infoBox: {
    backgroundColor: DarkMessNoteColors.primaryContainer,
    borderColor: DarkMessNoteColors.noteBubbleAccent,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  infoText: {
    color: DarkMessNoteColors.noteBubbleAccent,
    ...MessNoteTypography.bodyMedium,
  },
});
