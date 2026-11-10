import { useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIntegration, useTask } from '../../src/integration/hooks';
import { integrationApi as api } from '../../src/integration/runtime';
import { UserStatus } from '../../src/integration/user/Screen';
import { WelcomeCat } from '../../src/integration/user/WelcomeScreen';

export default function More() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const session = useIntegration();
  const member = session.authenticated && session.user?.status === 'ACTIVE';
  const go = (path: string) => router.push(path as Href);
  if (member) return <MemberControlRoom nickname={session.user?.nickname ?? '별지기'} go={go} />;
  return <GuestControlRoom go={go} returnTo={returnTo === '/social' ? returnTo : undefined} />;
}

function GuestControlRoom({ go, returnTo }: { go: (path: string) => void; returnTo?: '/social' }) {
  const router = useRouter();
  const openSocial = () =>
    returnTo ? router.push({ pathname: '/account', params: { returnTo } }) : go('/account');
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.memberContent}>
        <Text style={s.memberTitle}>제어실</Text>
        <View style={s.guestProfile}>
          <WelcomeCat size={105} />
          <Text style={s.guestTitle}>탐험의 기록을 저장해요.</Text>
          <Text style={s.guestDescription}>지금까지의 학습과 우주선을 이어가세요.</Text>
        </View>
        <View style={s.authOptions}>
          <AuthOption title="Apple로 계속하기" onPress={openSocial} apple />
          <AuthOption title="Google로 계속하기" onPress={openSocial} />
          <AuthOption title="카카오로 계속하기" onPress={openSocial} kakao />
          <AuthOption
            title="이메일로 로그인하기"
            onPress={() =>
              returnTo
                ? router.push('/account-email?returnTo=%2Fsocial' as Href)
                : go('/account-email')
            }
          />
        </View>
        <Text style={s.guestNote}>비회원 기록은 이 기기에만 남아요.</Text>
        <Text style={s.authNotice}>
          소셜 계정 연동은 준비 중입니다. 계정 화면에서 이메일로 로그인할 수 있습니다.
        </Text>
        <View style={s.legalLinks}>
          <Pressable accessibilityRole="button" onPress={() => go('/settings/terms')}>
            <Text style={s.legalText}>이용약관</Text>
          </Pressable>
          <Text style={s.legalSeparator}>·</Text>
          <Pressable accessibilityRole="button" onPress={() => go('/settings/privacy')}>
            <Text style={s.legalText}>개인정보처리방침</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthOption({
  title,
  onPress,
  apple = false,
  kakao = false,
}: {
  title: string;
  onPress: () => void;
  apple?: boolean;
  kakao?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="계정 화면으로 이동"
      onPress={onPress}
      style={[s.authOption, apple && s.appleOption, kakao && s.kakaoOption]}
    >
      <Text style={[s.authOptionText, apple && s.appleOptionText, kakao && s.kakaoOptionText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function MemberControlRoom({ nickname, go }: { nickname: string; go: (path: string) => void }) {
  const router = useRouter();
  const task = useTask();
  const [modal, setModal] = useState<'terms' | 'privacy' | 'contact' | 'logout'>('terms');
  const [modalVisible, setModalVisible] = useState(false);
  const [contactText, setContactText] = useState('');
  const openModal = (kind: 'terms' | 'privacy' | 'contact' | 'logout') => {
    setModal(kind);
    setModalVisible(true);
  };
  const modalTitle =
    modal === 'terms'
      ? '이용약관'
      : modal === 'privacy'
        ? '개인정보처리방침'
        : modal === 'logout'
          ? '로그아웃할까요?'
          : '문의하기';
  const logout = () =>
    void task.run(async () => {
      await api.account.logout(false);
      setModalVisible(false);
      router.replace('/more');
    });
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.memberContent}>
        <Text style={s.memberTitle}>제어실</Text>
        <Pressable accessibilityRole="button" onPress={() => go('/profile')} style={s.profileRow}>
          <View style={s.avatar}>
            <WelcomeCat size={46} />
          </View>
          <View style={s.profileText}>
            <Text style={s.nickname}>{nickname}</Text>
            <Text style={s.profileSub}>프로필과 계정 ›</Text>
          </View>
        </Pressable>
        <View style={s.memberGroup}>
          <MemberRow title="우주선 관리하기" onPress={() => go('/settings/universe')} />
          <MemberRow title="알림" onPress={() => go('/settings/notifications')} last />
        </View>
        <View style={s.memberGroup}>
          <MemberRow title="이용약관" onPress={() => openModal('terms')} />
          <MemberRow title="개인정보처리방침" onPress={() => openModal('privacy')} />
          <MemberRow title="문의하기" onPress={() => openModal('contact')} external last />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => openModal('logout')}
          style={s.logoutButton}
        >
          <Text style={s.logoutText}>로그아웃</Text>
        </Pressable>
      </ScrollView>
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <ScrollView
            style={s.modalPanel}
            contentContainerStyle={s.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.modalTitle}>{modalTitle}</Text>
            {modal === 'logout' ? (
              <>
                <Text style={s.modalDescription}>로그아웃하면 다시 로그인해야 합니다.</Text>
                <View style={s.logoutActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setModalVisible(false)}
                    style={s.logoutCancel}
                  >
                    <Text style={s.logoutCancelText}>취소</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={task.busy}
                    onPress={logout}
                    style={s.logoutConfirm}
                  >
                    <Text style={s.logoutConfirmText}>로그아웃</Text>
                  </Pressable>
                </View>
                <UserStatus task={task} />
              </>
            ) : modal === 'contact' ? (
              <>
                <Text style={s.modalDescription}>불편한 점이나 궁금한 점을 적어 주세요.</Text>
                <Text style={s.modalLabel}>문의 내용</Text>
                <TextInput
                  accessibilityLabel="문의 내용"
                  placeholder="내용을 입력해 주세요."
                  placeholderTextColor="#aaa3b1"
                  value={contactText}
                  onChangeText={setContactText}
                  multiline
                  maxLength={1000}
                  style={s.contactInput}
                />
                <Text style={s.modalDescription}>문의 접수 기능은 준비 중입니다.</Text>
              </>
            ) : (
              <Text style={s.modalDescription}>{modalTitle} 본문 준비 중</Text>
            )}
            {modal !== 'logout' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setModalVisible(false)}
                style={s.modalButton}
              >
                <Text style={s.modalButtonText}>닫기</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MemberRow({
  title,
  onPress,
  last = false,
  external = false,
}: {
  title: string;
  onPress: () => void;
  last?: boolean;
  external?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.memberRow, last && s.memberRowLast]}
    >
      <Text style={s.memberRowText}>{title}</Text>
      <Text style={s.memberChevron}>{external ? '↗' : '›'}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  memberContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  memberTitle: { color: '#282636', fontSize: 25, fontWeight: '700', marginBottom: 23 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    minHeight: 72,
    paddingHorizontal: 13,
    backgroundColor: '#f2edf7',
    borderRadius: 22,
  },
  avatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  profileText: { gap: 5 },
  nickname: { color: '#282636', fontSize: 16, fontWeight: '700' },
  profileSub: { color: '#aaa3b1', fontSize: 12 },
  memberGroup: {
    borderWidth: 1,
    borderColor: '#eeeaf3',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 3,
    marginTop: 20,
  },
  memberRow: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f2eff6',
  },
  memberRowLast: { borderBottomWidth: 0 },
  memberRowText: { color: '#282636', fontSize: 14 },
  memberChevron: { color: '#b3abbc', fontSize: 19 },
  logoutButton: {
    minHeight: 48,
    marginTop: 'auto',
    paddingTop: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: '#8c8296', fontSize: 13 },
  guestProfile: { alignItems: 'center', marginTop: 12 },
  guestTitle: {
    color: '#282636',
    fontSize: 21,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  guestDescription: { color: '#888591', fontSize: 13, lineHeight: 22, textAlign: 'center' },
  authOptions: { gap: 10, marginTop: 30, marginBottom: 22 },
  authOption: {
    width: '100%',
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: '#f3f0f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  authOptionText: { color: '#282636', fontSize: 14, fontWeight: '600' },
  appleOption: { backgroundColor: '#302b36' },
  appleOptionText: { color: '#fff' },
  kakaoOption: { backgroundColor: '#f1f0f3' },
  kakaoOptionText: { color: '#39333f' },
  guestNote: { color: '#888591', fontSize: 12, textAlign: 'center' },
  authNotice: {
    color: '#a49caf',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
  },
  legalText: { color: '#8c8296', fontSize: 11, paddingVertical: 8 },
  legalSeparator: { color: '#99909e', fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#34273c63',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 23,
  },
  modalContent: { padding: 25, gap: 12 },
  modalTitle: { color: '#282636', fontSize: 20, fontWeight: '700' },
  modalDescription: { color: '#9a8aa4', fontSize: 13, lineHeight: 21 },
  modalLabel: { color: '#9a8ba7', fontSize: 12, marginTop: 4 },
  contactInput: {
    minHeight: 115,
    borderWidth: 1,
    borderColor: '#ded4e5',
    borderRadius: 11,
    padding: 12,
    backgroundColor: '#fbf9fd',
    color: '#4e3f5b',
    fontSize: 13,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  modalButton: {
    minHeight: 45,
    backgroundColor: '#f3f1f6',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  modalButtonText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
  logoutActions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  logoutCancel: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#f3f1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutCancelText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
  logoutConfirm: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#373044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutConfirmText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
