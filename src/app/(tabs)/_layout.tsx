import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { C } from '@/ui/theme';

type TabIcon = keyof typeof Ionicons.glyphMap;

const items: { name: string; title: string; icon: TabIcon; selected: TabIcon }[] = [
  { name: 'index', title: '今天', icon: 'home-outline', selected: 'home' },
  { name: 'plans', title: '计划', icon: 'calendar-outline', selected: 'calendar' },
  { name: 'exercises', title: '动作', icon: 'barbell-outline', selected: 'barbell' },
  { name: 'history', title: '历史', icon: 'stats-chart-outline', selected: 'stats-chart' },
  { name: 'me', title: '我的', icon: 'person-outline', selected: 'person' },
];

export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.accent, tabBarInactiveTintColor: C.faint, tabBarStyle: { backgroundColor: '#12181C', borderTopColor: C.line, height: 72, paddingTop: 8, paddingBottom: 12 }, tabBarLabelStyle: { fontSize: 10, fontWeight: '700' } }}>
    {items.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.title, tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? item.selected : item.icon} color={color} size={22} /> }} />)}
  </Tabs>;
}
