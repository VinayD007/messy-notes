import { useEffect } from 'react';
import { ActivityIndicator, Platform, StatusBar as RnStatusBar, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthScreen } from './screens/AuthScreen';
import { FeedScreen } from './screens/FeedScreen';
import { useAuthStore } from './store/authStore';
import { useNotesStore } from './store/notesStore';
import { useThemeStore } from './store/themeStore';

export function App() {
  const { user, initialized, initialize } = useAuthStore();
  const { startSync, stopSync } = useNotesStore();
  const { isDark, palette } = useThemeStore();

  useEffect(() => {
    const unsubscribeAuth = initialize();
    return unsubscribeAuth;
  }, [initialize]);

  useEffect(() => {
    RnStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
    if (Platform.OS === 'android') {
      RnStatusBar.setBackgroundColor(palette.bg, true);
    }
  }, [isDark, palette.bg]);

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
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.bg }]}>
        <StatusBar
          style={isDark ? 'light' : 'dark'}
          backgroundColor={palette.bg}
          translucent={false}
        />
        {!initialized ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={palette.noteBubbleAccent} />
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
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
