import { Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HouseEditingProvider,
  useHouseEditing,
} from '../../src/components/house/HouseEditingContext';
import { useIntegration } from '../../src/integration/hooks';

const dockItems = [
  { name: 'quiz', label: '학습' },
  { name: 'index', label: '우주선' },
  { name: 'more', label: '제어실' },
];

type DockBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0] & {
  bottom: number;
  guest: boolean;
};

function DockBar({ state, navigation, bottom, guest }: DockBarProps) {
  const guestControlRoom = guest && state.routes[state.index]?.name === 'more';
  return (
    <View
      style={[
        dockStyles.bar,
        guestControlRoom && dockStyles.guestBar,
        { height: 64 + bottom, paddingBottom: bottom },
      ]}
    >
      <View style={dockStyles.items}>
        {dockItems.map((item) => {
          const routeIndex = state.routes.findIndex((route) => route.name === item.name);
          const route = state.routes[routeIndex];
          if (!route) return null;
          const selected = state.index === routeIndex;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={[
                dockStyles.item,
                selected && dockStyles.selected,
                selected && guestControlRoom && dockStyles.guestSelected,
              ]}
            >
              <Text
                style={[
                  dockStyles.label,
                  guestControlRoom && dockStyles.guestLabel,
                  selected && dockStyles.selectedLabel,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
  if (!session.authenticated) return <Redirect href="/welcome" />;

  return (
    <Tabs
      tabBar={(props) =>
        isEditing ? null : (
          <DockBar {...props} bottom={bottom} guest={session.user?.status === 'GUEST'} />
        )
      }
      screenOptions={{
        headerShown: false,
      }}
    >
      {dockItems.map((item) => (
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{
            title: item.label,
          }}
        />
      ))}
      <Tabs.Screen name="social" options={{ href: null }} />
    </Tabs>
  );
}

const dockStyles = StyleSheet.create({
  bar: { width: '100%', backgroundColor: '#161616' },
  guestBar: { backgroundColor: '#e4e4e4' },
  items: { width: '100%', height: 64, flexDirection: 'row' },
  item: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' },
  selected: { borderBottomWidth: 4, borderBottomColor: '#f1f1f1' },
  guestSelected: { borderBottomColor: '#161616' },
  label: {
    color: '#f1f1f1',
    fontSize: 16,
    lineHeight: 15,
    fontFamily: 'PretendardMedium',
    includeFontPadding: false,
  },
  selectedLabel: { fontFamily: 'PretendardBold' },
  guestLabel: { color: '#161616' },
});
