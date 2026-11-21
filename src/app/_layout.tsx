import { configureWebAlerts } from '@/lib/web-alerts';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { DataProvider } from '@/lib/data';
import { migrate } from '@/lib/database';
import { configureNotifications } from '@/lib/notifications';
import { WorkoutTimerProvider } from '@/lib/workout-timer';
import { useTheme } from '@/ui/theme';

configureWebAlerts();
configureNotifications();

export default function RootLayout() {
  const { c, scheme } = useTheme();
  useEffect(() => { SystemUI.setBackgroundColorAsync(c.bg).catch(() => {}); }, [c.bg]);
  return <Suspense fallback={<View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View>}>
    <SQLiteProvider databaseName="lianji.db" onInit={migrate} useSuspense>
      <DataProvider>
        <WorkoutTimerProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="workout" options={{ gestureEnabled: true }} />
            <Stack.Screen name="plan-editor" />
            <Stack.Screen name="training-schedule" />
            <Stack.Screen name="history/[id]" />
            <Stack.Screen name="history/edit/[id]" />
            <Stack.Screen name="nutrition" />
          </Stack>
        </WorkoutTimerProvider>
      </DataProvider>
    </SQLiteProvider>
  </Suspense>;
}
