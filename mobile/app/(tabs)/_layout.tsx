import { Tabs } from 'expo-router';
import { ActivityIndicator, type ColorValue, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HouseEditingProvider,
  useHouseEditing,
} from '../../src/components/house/HouseEditingContext';
import { useIntegration } from '../../src/integration/hooks';
import WelcomeScreen from '../../src/integration/user/WelcomeScreen';

type DockIcon = 'home' | 'ship' | 'control';

const iconPaths: Record<DockIcon, string> = {
  home: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  ship: 'M7 9V6a5 5 0 0110 0v3M5 9h14l2 11H3L5 9zM9 13h6M9 17h6',
  control: 'M4 7h16M4 17h16M8 4v6M16 14v6',
};

const dockItems: { name: string; label: string; icon: DockIcon }[] = [
  { name: 'quiz', label: '학습', icon: 'home' },
  { name: 'index', label: '우주선', icon: 'ship' },
  { name: 'more', label: '제어실', icon: 'control' },
];

function TabIcon({ icon, color }: { icon: DockIcon; color: ColorValue }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d={iconPaths[icon]}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function TabsLayout() {
  return (
    <HouseEditingProvider>
      <TabNavigator />
    </HouseEditingProvider>
  );
}

function TabNavigator() {
  const { isEditing } = useHouseEditing();
  const { bottom } = useSafeAreaInsets();
  const session = useIntegration();

  if (!session.ready)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="계정 확인 중" />
      </View>
    );
  if (!session.authenticated) return <WelcomeScreen />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#5a4d77',
        tabBarInactiveTintColor: '#aaa6b2',
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 3 },
        tabBarStyle: {
          display: isEditing ? 'none' : 'flex',
          height: 73 + bottom,
          borderTopColor: '#f1eff5',
          backgroundColor: '#ffffff',
          paddingTop: 9,
          paddingBottom: Math.max(9, bottom),
        },
      }}
    >
      {dockItems.map((item) => (
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{
            title: item.label,
            tabBarIcon: ({ color }) => <TabIcon icon={item.icon} color={color} />,
          }}
        />
      ))}
      <Tabs.Screen name="social" options={{ href: null }} />
    </Tabs>
  );
}
