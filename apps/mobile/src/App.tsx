import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DarkMessNoteColors } from '@messy-notes/shared';
import { AuthScreen } from './screens/AuthScreen';
import { FeedScreen } from './screens/FeedScreen';
import { useAuthStore } from './store/authStore';
import { useNotesStore } from './store/notesStore';

export function App() {
  const { user, initialized, initialize } = useAuthStore();
  const { startSync, stopSync } = useNotesStore();

  useEffect(() => {
    const unsubscribeAuth = initialize();
    return unsubscribeAuth;
  }, [initialize]);

  useEffect(() => {
    if (!user?.id) {
      stopSync();
      return;
    }

    void startSync(user.id);
    return () => {
      stopSync();
    };
  }, [user?.id, startSync, stopSync]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        {!initialized ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={DarkMessNoteColors.noteBubbleAccent} />
          </View>
        ) : !user ? (
          <AuthScreen />
        ) : (
          <FeedScreen />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DarkMessNoteColors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
