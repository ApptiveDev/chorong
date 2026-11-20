import { Redirect, Tabs, useGlobalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HouseEditingProvider,
  useHouseEditing,
} from '../../src/components/house/HouseEditingContext';
import { useIntegration } from '../../src/integration/hooks';
import { HOUSING_LOGIN_PARAM } from '../../src/integration/user/housingGate';
import { HousingLoginModal } from '../../src/integration/user/SocialLoginModal';

const dockItems = [
  // 메인(/)은 학습이다. 우주선은 /housing.
  { name: 'index', label: '학습' },
  { name: 'housing', label: '우주선' },
  { name: 'more', label: '제어실' },
];

type DockBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0] & {
  bottom: number;
  // 비회원이 우주선 탭을 누르면 이동하지 않고 로그인 유도 모달을 띄운다.
  onGuestHousing?: () => void;
};

function DockBar({ state, emitter, navigateToTab, bottom, onGuestHousing }: DockBarProps) {
  return (
    <View style={[dockStyles.bar, { height: 64 + bottom, paddingBottom: bottom }]}>
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
                if (item.name === 'housing' && onGuestHousing) {
                  onGuestHousing();
                  return;
                }
                const event = emitter.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented) navigateToTab(route.key);
              }}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={[dockStyles.item, selected && dockStyles.selected]}
            >
              <Text style={[dockStyles.label, selected && dockStyles.selectedLabel]}>
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
  const router = useRouter();
  const guest = session.user?.status === 'GUEST';
  const [housingLoginOpen, setHousingLoginOpen] = useState(false);
  // 비회원이 우주선 주소로 들어오면 GuestHousingGuard 가 학습 홈(?login=housing)으로 돌려보낸다.
  const { login } = useGlobalSearchParams<{ login?: string }>();
  useEffect(() => {
    if (login !== HOUSING_LOGIN_PARAM) return;
    if (guest) setHousingLoginOpen(true);
    router.setParams({ login: undefined });
  }, [login, guest, router]);

  if (!session.ready)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="계정 확인 중" />
      </View>
    );
  if (!session.authenticated) return <Redirect href="/welcome" />;

  const tabs = (
    <Tabs
      tabBar={(props) =>
        isEditing ? null : (
          <DockBar
            {...props}
            bottom={bottom}
            onGuestHousing={guest ? () => setHousingLoginOpen(true) : undefined}
          />
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
      {/* 구경하기. 하단 탭바(DockBar)는 dockItems 만 그리므로 버튼은 생기지 않는다.
          href: null 을 주면 expo-router 58 이 숨긴 탭으로 보고 들어오는 즉시 첫 탭(학습)으로 되돌린다. */}
      <Tabs.Screen name="social" options={{ title: '구경하기' }} />
    </Tabs>
  );

  return (
    <>
      {tabs}
      <HousingLoginModal
        visible={housingLoginOpen && guest}
        onLater={() => setHousingLoginOpen(false)}
        onDismiss={() => setHousingLoginOpen(false)}
        onSignedIn={() => {
          setHousingLoginOpen(false);
          router.navigate('/housing');
        }}
      />
    </>
  );
}

const dockStyles = StyleSheet.create({
  bar: { width: '100%', backgroundColor: '#161616' },
  items: { width: '100%', height: 64, flexDirection: 'row' },
  item: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' },
  selected: { borderBottomWidth: 4, borderBottomColor: '#f1f1f1' },
  label: {
    color: '#f1f1f1',
    fontSize: 16,
    lineHeight: 15,
    fontFamily: 'PretendardMedium',
    includeFontPadding: false,
  },
  selectedLabel: { fontFamily: 'PretendardBold' },
});
