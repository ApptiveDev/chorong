import { useEffect } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIntegration, useTask } from '../../src/integration/hooks';
import { integrationApi as api } from '../../src/integration/runtime';
import {
  MemberLicenceBarcode,
  MemberLicenceSignatureOne,
  MemberLicenceSignatureTwo,
  MemberLicenceStar,
} from '../../src/components/MemberLicenceArt';
const providerNames: Record<string, string> = {
  EMAIL: 'Email',
  GOOGLE: 'Google',
  KAKAO: 'Kakao',
  APPLE: 'Apple',
};

export default function More() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const session = useIntegration();
  const member = session.authenticated && session.user?.status === 'ACTIVE';
  const go = (path: string) => router.push(path as Href);
  if (member) return <MemberControlRoom go={go} />;
  return <GuestControlRoom go={go} returnTo={returnTo === '/social' ? returnTo : undefined} />;
}

function GuestControlRoom({ go, returnTo }: { go: (path: string) => void; returnTo?: '/social' }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openSocial = () =>
    returnTo ? router.push({ pathname: '/account', params: { returnTo } }) : go('/account');
  return (
    <SafeAreaView style={s.guestSafe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={s.guestScroll}
        contentContainerStyle={[s.guestContent, { paddingTop: Math.max(8, 52 - insets.top) }]}
      >
        <View style={s.guestHeader}>
          <Text style={s.guestHeaderTitle}>제어실</Text>
        </View>
        <View style={s.guestColumn}>
          <View style={s.guestCard}>
            <View style={s.guestCardHeader}>
              <Text style={s.licenceTitle}>Astronaut Licence</Text>
              <Text style={s.licenceNumber} accessibilityLabel="우주선 번호 없음">
                No. —
              </Text>
            </View>
            <View style={s.guestCardBody}>
              <Image
                source={require('../../assets/control-room-guest-profile.png')}
                resizeMode="cover"
                style={s.guestCardImage}
                accessibilityLabel="비회원 프로필"
              />
              <Text
                style={s.guestCardCopy}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                비회원으로 탐험 중입니다.
              </Text>
            </View>
          </View>
          <View style={s.guestMenu}>
            <GuestMenuButton title="로그인" onPress={openSocial} />
            <GuestMenuButton
              title="우주선 관리하기"
              onPress={() => go('/settings/universe')}
              highlight
            />
            <GuestMenuButton title="알림" onPress={() => go('/settings/notifications')} />
            <GuestMenuButton title="이용약관" onPress={() => go('/settings/terms')} />
            <GuestMenuButton title="개인정보 처리방침" onPress={() => go('/settings/privacy')} />
            <GuestMenuButton title="문의하기" onPress={() => go('/settings/contact')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function GuestMenuButton({
  title,
  onPress,
  highlight = false,
}: {
  title: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.guestMenuButton, highlight && s.guestMenuHighlight]}
    >
      <Text style={s.guestMenuText}>{title}</Text>
    </Pressable>
  );
}

function MemberControlRoom({ go }: { go: (path: string) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const session = useIntegration();
  const task = useTask();
  const user = session.user;
  useEffect(() => {
    if (
      session.ready &&
      session.authenticated &&
      user?.status === 'ACTIVE' &&
      !('providers' in user)
    )
      void task.run(() => api.account.me());
  }, [session.ready, session.authenticated, user?.status]);

  const provider =
    user && 'providers' in user ? user.providers.find((item) => item !== 'GUEST') : null;
  const loginMethod = provider ? (providerNames[provider] ?? provider) : '—';
  const nickname = user?.nickname?.trim() || '—';
  const cardScale = Math.min(1, Math.max(0, (width - 64) / 332));

  return (
    <SafeAreaView style={s.guestSafe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={s.guestScroll}
        contentContainerStyle={[s.guestContent, { paddingTop: Math.max(8, 52 - insets.top) }]}
      >
        <View style={s.guestHeader}>
          <Text style={s.guestHeaderTitle}>제어실</Text>
        </View>
        <View style={s.guestColumn}>
          <View style={{ width: 332 * cardScale, height: 168 * cardScale }}>
            <View
              style={[
                s.memberCardFrame,
                { transform: [{ scale: cardScale }], transformOrigin: [0, 0, 0] },
              ]}
            >
              <View style={s.memberCardShadow} />
              <View style={s.memberCard}>
                <View style={[s.guestCardHeader, s.memberCardHeader]}>
                  <Text style={s.licenceTitle}>Astronaut Licence</Text>
                  <Text style={s.licenceNumber} accessibilityLabel="회원증 번호 정보 없음">
                    No. —
                  </Text>
                </View>
                <Image
                  source={require('../../assets/control-room-member-profile.png')}
                  resizeMode="cover"
                  style={s.memberPhoto}
                  accessibilityLabel="흰 고양이 프로필"
                />
                <View style={s.memberNameField}>
                  <Text style={s.memberFieldLabel}>NAME</Text>
                  <Text style={s.memberFieldValue} numberOfLines={1} adjustsFontSizeToFit>
                    {nickname}
                  </Text>
                </View>
                <View style={s.memberLoginField}>
                  <Text style={s.memberFieldLabel}>LogIn</Text>
                  <Text style={s.memberFieldValue} numberOfLines={1} adjustsFontSizeToFit>
                    {loginMethod}
                  </Text>
                </View>
                <View style={s.memberDateField}>
                  <Text style={s.memberFieldLabel}>Date of Issue</Text>
                  <Text style={s.memberFieldValue}>—</Text>
                </View>
                <MemberLicenceStar style={s.memberStar} accessible={false} />
                <MemberLicenceSignatureOne style={s.memberSignatureOne} accessible={false} />
                <MemberLicenceSignatureTwo style={s.memberSignatureTwo} accessible={false} />
                <MemberLicenceBarcode style={s.memberBarcode} accessible={false} />
              </View>
            </View>
          </View>
          {task.error ? <Text style={s.memberError}>회원 정보를 불러오지 못했습니다.</Text> : null}
          <View style={s.guestMenu}>
            <GuestMenuButton title="프로필과 계정" onPress={() => go('/profile')} />
            <GuestMenuButton
              title="우주선 관리하기"
              onPress={() => go('/settings/universe')}
              highlight
            />
            <GuestMenuButton title="알림" onPress={() => go('/settings/notifications')} />
            <GuestMenuButton title="이용약관" onPress={() => go('/settings/terms')} />
            <GuestMenuButton title="개인정보 처리방침" onPress={() => go('/settings/privacy')} />
            <GuestMenuButton title="문의하기" onPress={() => go('/settings/contact')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  guestSafe: { flex: 1, backgroundColor: '#e4e4e4' },
  guestScroll: { flex: 1 },
  guestContent: { flexGrow: 1, alignItems: 'center', paddingBottom: 32 },
  guestHeader: { width: '100%', paddingHorizontal: 32, marginBottom: 60 },
  guestHeaderTitle: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 24,
    lineHeight: 29,
    includeFontPadding: false,
  },
  guestColumn: { width: '100%', maxWidth: 396, paddingHorizontal: 32, alignItems: 'center' },
  guestCard: {
    width: '100%',
    maxWidth: 332,
    height: 164,
    backgroundColor: '#a0a0a0',
    borderWidth: 1,
    borderBottomWidth: 4,
    borderColor: '#161616',
    borderRadius: 8,
    overflow: 'hidden',
  },
  guestCardHeader: {
    height: 31,
    backgroundColor: '#f2f2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 17,
    paddingRight: 12,
  },
  licenceTitle: { color: '#161616', fontFamily: 'TekoRegular', fontSize: 20, lineHeight: 24 },
  licenceNumber: { color: '#161616', fontFamily: 'TekoRegular', fontSize: 16, lineHeight: 20 },
  guestCardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 26,
    paddingHorizontal: 19,
  },
  guestCardImage: {
    width: 96,
    height: 100,
    borderWidth: 1,
    borderColor: '#161616',
    backgroundColor: '#d9d9d9',
  },
  guestCardCopy: {
    flex: 1,
    color: '#161616',
    fontFamily: 'KkakdugiRegular',
    fontSize: 16,
    includeFontPadding: false,
  },
  guestMenu: { width: '100%', maxWidth: 332, gap: 12, marginTop: 40 },
  guestMenuButton: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f1f1',
    borderWidth: 1.5,
    borderColor: '#161616',
    borderRadius: 4,
  },
  guestMenuHighlight: { backgroundColor: '#70e2f1' },
  guestMenuText: {
    color: '#161616',
    fontFamily: 'PretendardRegular',
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  memberCardFrame: { width: 332, height: 168 },
  memberCardShadow: {
    position: 'absolute',
    top: 4,
    width: 332,
    height: 164,
    backgroundColor: '#161616',
    borderRadius: 8,
  },
  memberCard: {
    width: 332,
    height: 164,
    backgroundColor: '#ffdc2e',
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 8,
    overflow: 'hidden',
  },
  memberCardHeader: { backgroundColor: '#f1f1f1' },
  memberPhoto: {
    position: 'absolute',
    left: 20,
    top: 46,
    width: 96,
    height: 99,
    borderWidth: 1,
    borderColor: '#161616',
  },
  memberNameField: { position: 'absolute', left: 136, top: 43, width: 91 },
  memberLoginField: { position: 'absolute', left: 231, top: 43, width: 91 },
  memberDateField: { position: 'absolute', left: 136, top: 73, width: 100 },
  memberFieldLabel: {
    color: '#161616',
    fontFamily: 'TekoRegular',
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
  },
  memberFieldValue: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  memberStar: { position: 'absolute', left: 235, top: 70, width: 83, height: 59 },
  memberSignatureOne: { position: 'absolute', left: 139, top: 112, width: 89, height: 23 },
  memberSignatureTwo: { position: 'absolute', left: 170, top: 129, width: 129, height: 23 },
  memberBarcode: { position: 'absolute', right: 0, top: 44, width: 13, height: 106 },
  memberError: { color: '#161616', fontFamily: 'PretendardRegular', fontSize: 12, marginTop: 8 },
});
