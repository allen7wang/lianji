import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { DataProvider } from '@/lib/data';
import { migrate } from '@/lib/database';
import { C } from '@/ui/theme';

export default function RootLayout() {
  return <Suspense fallback={<View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>}>
    <SQLiteProvider databaseName="lianji.db" onInit={migrate} useSuspense>
      <DataProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workout" />
          <Stack.Screen name="plan-editor" />
          <Stack.Screen name="history/[id]" />
          <Stack.Screen name="nutrition" />
        </Stack>
      </DataProvider>
    </SQLiteProvider>
  </Suspense>;
}
