import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveWorkoutBar } from '@/ui/active-workout-bar';
import { useTheme } from '@/ui/theme';

type TabIcon = keyof typeof Ionicons.glyphMap;

const items: { name: string; title: string; icon: TabIcon; selected: TabIcon }[] = [
  { name: 'index', title: '今天', icon: 'flash-outline', selected: 'flash' },
  { name: 'plans', title: '计划', icon: 'albums-outline', selected: 'albums' },
  { name: 'exercises', title: '动作', icon: 'barbell-outline', selected: 'barbell' },
  { name: 'history', title: '进度', icon: 'pulse-outline', selected: 'pulse' },
  { name: 'me', title: '我的', icon: 'person-circle-outline', selected: 'person-circle' },
];

const TAB_BAR_HEIGHT = 60;

export default function TabLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const barHeight = TAB_BAR_HEIGHT + Math.max(insets.bottom, 8);
  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <Tabs screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: c.bg },
      tabBarActiveTintColor: c.text,
      tabBarInactiveTintColor: c.textFaint,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, borderTopWidth: 1, height: barHeight, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      {items.map(item => <Tabs.Screen key={item.name} name={item.name} options={{
        title: item.title,
        tabBarAccessibilityLabel: item.title,
        tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? item.selected : item.icon} color={color} size={23} />,
      }} />)}
    </Tabs>
    <ActiveWorkoutBar bottom={barHeight + 10} />
  </View>;
}
