import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

const dockItems: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', label: '홈', icon: 'home-outline', iconActive: 'home' },
  { name: 'quiz', label: '학습', icon: 'book-outline', iconActive: 'book' },
  { name: 'social', label: '소셜', icon: 'people-outline', iconActive: 'people' },
  { name: 'more', label: '더보기', icon: 'menu-outline', iconActive: 'menu' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0f172a',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarStyle: { borderTopColor: '#cbd5e1', backgroundColor: '#ffffff' },
      }}
    >
      {dockItems.map((item) => (
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{
            title: item.label,
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={focused ? item.iconActive : item.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
