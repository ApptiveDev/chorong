import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIntegration } from '../../src/integration/hooks';

const extra = [
  { title: '로그인·기록 연결', path: '/account' },
  { title: '인벤토리', path: '/room/inventory' },
  { title: '상점', path: '/room/shop' },
  { title: '복습하기', path: '/review' },
  { title: '시작 안내', path: '/onboarding' },
  { title: '앱 정보', path: '/settings/app-info' },
  { title: '개발자 도구', path: '/settings/dev-tools' },
] as const;

export default function More() {
  const router = useRouter();
  const session = useIntegration();
  const [showExtra, setShowExtra] = useState(false);
  const member = session.authenticated && session.user?.status === 'ACTIVE';
  const guest = session.authenticated && session.user?.status === 'GUEST';
  const go = (path: string) => router.push(path as Href);
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>제어실</Text>
        <View style={s.account}>
          <Text style={s.accountName}>
            {member
              ? session.user?.nickname
              : guest
                ? session.user?.nickname
                : '비회원으로 탐험 중이에요'}
          </Text>
          <Text style={s.caption}>
            {member ? '회원' : guest ? '게스트 로그인' : '로그인하지 않았습니다.'}
          </Text>
        </View>
        {!member ? (
          <Row title="로그인" onPress={() => go('/account')} primary />
        ) : (
          <>
            <Row title="프로필과 계정" onPress={() => go('/profile')} />
            <Row title="우주선 관리하기" onPress={() => go('/settings/universe')} />
          </>
        )}
        {!member ? <Row title="삭제 요청" onPress={() => go('/settings/delete-request')} /> : null}
        <Row title="이용약관" onPress={() => go('/settings/terms')} />
        <Row title="개인정보처리방침" onPress={() => go('/settings/privacy')} />
        <Row title="문의" onPress={() => go('/settings/contact')} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showExtra }}
          onPress={() => setShowExtra((value) => !value)}
          style={s.extraToggle}
        >
          <Text style={s.caption}>기타 메뉴</Text>
          <Ionicons name={showExtra ? 'chevron-up' : 'chevron-down'} size={16} color="#7b8795" />
        </Pressable>
        {showExtra
          ? extra.map((item) => (
              <Row key={item.path} title={item.title} onPress={() => go(item.path)} />
            ))
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  title,
  onPress,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.row, primary && s.primary]}>
      <Text style={[s.rowText, primary && s.primaryText]}>{title}</Text>
      {!primary ? <Ionicons name="chevron-forward" size={16} color="#7b8795" /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 18, gap: 5, paddingBottom: 40 },
  title: { color: '#273a52', fontSize: 21, fontWeight: '700', marginBottom: 10 },
  account: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    backgroundColor: '#f8f9fb',
    padding: 14,
    gap: 3,
    marginBottom: 5,
  },
  accountName: { color: '#273a52', fontSize: 14, fontWeight: '700' },
  caption: { color: '#7b8795', fontSize: 12 },
  row: {
    minHeight: 45,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 5,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: { color: '#273a52', fontSize: 13 },
  primary: { backgroundColor: '#273a52', justifyContent: 'center', marginBottom: 4 },
  primaryText: { color: '#fff', fontWeight: '700' },
  extraToggle: {
    marginTop: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
