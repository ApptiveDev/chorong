import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import {
  HouseEditingProvider,
  useHouseEditing,
} from '../../src/components/house/HouseEditingContext';

type IconName = ComponentProps<typeof Ionicons>['name'];

const dockItems: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'quiz', label: '학습', icon: 'book-outline', iconActive: 'book' },
  { name: 'index', label: '나의 우주선', icon: 'planet-outline', iconActive: 'planet' },
  { name: 'more', label: '제어실', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
  return (
    <HouseEditingProvider>
      <TabNavigator />
    </HouseEditingProvider>
  );
}

function TabNavigator() {
  const { isEditing } = useHouseEditing();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0f172a',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarStyle: {
          display: isEditing ? 'none' : 'flex',
          borderTopColor: '#cbd5e1',
          backgroundColor: '#ffffff',
        },
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
      <Tabs.Screen name="social" options={{ href: null }} />
    </Tabs>
  );
}
