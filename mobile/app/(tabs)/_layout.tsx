import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** 하단 독 항목. 라벨·아이콘을 한 곳에서 관리한다 (jimba-service dock-items 패턴). */
const dockItems: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', label: '홈', icon: 'home-outline', iconActive: 'home' },
  { name: 'quiz', label: '퀴즈', icon: 'help-circle-outline', iconActive: 'help-circle' },
  { name: 'social', label: '소셜', icon: 'people-outline', iconActive: 'people' },
  { name: 'more', label: '더보기', icon: 'menu-outline', iconActive: 'menu' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'center',
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle: { borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
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
