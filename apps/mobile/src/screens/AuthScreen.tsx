import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
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
    <KeyboardAvoidingView
      behavior="height"
      style={styles.container}
    >
      <View style={styles.card}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.brandIcon}
        />
        <Text style={styles.title}>MessyNotes</Text>
        <Text style={styles.subtitle}>
          Offline-first notes with real-time Supabase sync
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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

        <Pressable
          style={[styles.primaryBtn, loading && styles.disabledBtn]}
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
          style={styles.linkBtn}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DarkMessNoteColors.bg,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: DarkMessNoteColors.surfaceContainerHigh,
    borderRadius: MessNoteMetrics.dialogCornerRadius,
    padding: 26,
    borderWidth: 1,
    borderColor: DarkMessNoteColors.outlineVariant,
    gap: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  brandIcon: {
    width: 64,
    height: 64,
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
    backgroundColor: DarkMessNoteColors.surfaceContainerLow,
    borderColor: DarkMessNoteColors.outlineVariant,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: DarkMessNoteColors.textPrimary,
    ...MessNoteTypography.bodyLarge,
  },
  primaryBtn: {
    backgroundColor: DarkMessNoteColors.noteBubbleAccent,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: DarkMessNoteColors.onAccent,
    fontWeight: '700',
    fontSize: 15,
  },
  linkBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  linkText: {
    color: DarkMessNoteColors.noteBubbleAccent,
    fontSize: 13,
  },
  errorText: {
    color: DarkMessNoteColors.destructiveAction,
    fontSize: 13,
  },
  infoText: {
    color: DarkMessNoteColors.noteBubbleAccent,
    fontSize: 13,
  },
});
