import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Me } from '../models';
import { UserStatus } from './Screen';
import { WelcomeCat } from './WelcomeScreen';

type Dialog = 'nickname' | 'logout' | 'withdraw' | null;
const providers: Record<string, string> = {
  EMAIL: '이메일',
  GOOGLE: 'Google',
  KAKAO: '카카오',
  APPLE: 'Apple',
};

export default function ProfileScreen() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [me, setMe] = useState<Me | null>(null);
  const [nickname, setNickname] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!session.ready || session.user?.status !== 'ACTIVE') return;
    void task.run(async () => {
      const result = await api.account.me();
      setMe(result);
      return result;
    });
  }, [session.ready, session.user?.status]);

  const saveNickname = () => {
    const next = nickname.trim();
    if (!next || task.busy) return;
    void task.run(async () => {
      const result = await api.account.update({ nickname: next });
      setMe(result);
      setDialog(null);
      setNotice('닉네임을 변경했어요.');
      return result;
    });
  };
  const finish = () => {
    if (task.busy || !dialog) return;
    void task.run(async () => {
      if (dialog === 'logout') await api.account.logout(false);
      if (dialog === 'withdraw') await api.account.withdraw();
      setDialog(null);
      router.replace('/more');
    });
  };
  const provider = me?.providers.find((item) => item !== 'GUEST');
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="제어실로 돌아가기"
            onPress={() => router.replace('/more')}
            style={s.back}
          >
            <Ionicons name="arrow-back" size={23} color="#282636" />
          </Pressable>
          <Text style={s.title}>프로필과 계정</Text>
        </View>
        <UserStatus task={task} />
        {notice ? <Text style={s.notice}>{notice}</Text> : null}
        {session.user?.status === 'ACTIVE' ? (
          <>
            <View style={s.profileCard}>
              <WelcomeCat size={46} />
              <View style={s.profileText}>
                <Text style={s.name}>{me?.nickname ?? session.user.nickname}</Text>
                <Text style={s.provider}>
                  {provider ? `${providers[provider] ?? provider}로 로그인` : '회원'}
                </Text>
              </View>
            </View>
            <View style={s.group}>
              <ProfileRow
                title="닉네임 변경하기"
                onPress={() => {
                  setNickname(me?.nickname ?? session.user?.nickname ?? '');
                  setDialog('nickname');
                }}
                last
              />
            </View>
            <View style={s.group}>
              <ProfileRow title="로그아웃" onPress={() => setDialog('logout')} />
              <ProfileRow title="회원 탈퇴" onPress={() => setDialog('withdraw')} last />
            </View>
          </>
        ) : (
          <View style={s.guest}>
            <Text style={s.copy}>로그인하면 프로필을 볼 수 있어요.</Text>
            <Pressable
              accessibilityRole="button"
              style={s.primary}
              onPress={() => router.push('/account')}
            >
              <Text style={s.primaryText}>로그인하기</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>
              {dialog === 'nickname'
                ? '닉네임 변경'
                : dialog === 'logout'
                  ? '로그아웃할까요?'
                  : '회원 탈퇴할까요?'}
            </Text>
            <Text style={s.modalCopy}>
              {dialog === 'nickname'
                ? '다른 별지기에게 보여줄 이름이에요.'
                : dialog === 'logout'
                  ? '다시 로그인하면 계정 기록을 볼 수 있어요.'
                  : '계정과 기록이 삭제되며 되돌릴 수 없어요.'}
            </Text>
            {dialog === 'nickname' ? (
              <>
                <Text style={s.inputLabel}>닉네임</Text>
                <TextInput
                  accessibilityLabel="닉네임"
                  placeholder="닉네임을 입력해 주세요."
                  placeholderTextColor="#aaa1b3"
                  value={nickname}
                  onChangeText={setNickname}
                  maxLength={16}
                  autoCorrect={false}
                  style={s.input}
                />
              </>
            ) : null}
            <UserStatus task={task} />
            <View style={s.actions}>
              <Pressable
                accessibilityRole="button"
                style={s.secondary}
                onPress={() => setDialog(null)}
              >
                <Text style={s.secondaryText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: task.busy || (dialog === 'nickname' && !nickname.trim()),
                }}
                disabled={task.busy || (dialog === 'nickname' && !nickname.trim())}
                onPress={dialog === 'nickname' ? saveNickname : finish}
                style={[
                  s.primary,
                  dialog === 'withdraw' && s.danger,
                  (task.busy || (dialog === 'nickname' && !nickname.trim())) && s.disabled,
                ]}
              >
                <Text style={[s.primaryText, dialog === 'withdraw' && s.dangerText]}>
                  {dialog === 'nickname' ? '저장' : dialog === 'logout' ? '로그아웃' : '회원 탈퇴'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProfileRow({
  title,
  onPress,
  last = false,
}: {
  title: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.row, last && s.rowLast]}>
      <Text style={s.rowText}>{title}</Text>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, marginBottom: 23 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#282636', fontSize: 21, lineHeight: 32, letterSpacing: -0.7, fontWeight: '700' },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    padding: 13,
    borderRadius: 22,
    backgroundColor: '#f2edf7',
  },
  profileText: { gap: 5 },
  name: { color: '#282636', fontSize: 17, fontWeight: '700' },
  provider: { color: '#888591', fontSize: 12 },
  group: {
    borderWidth: 1,
    borderColor: '#eeeaf3',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 3,
    marginTop: 20,
  },
  row: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f2eff6',
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { color: '#282636', fontSize: 14 },
  chevron: { color: '#b3abbc', fontSize: 19 },
  guest: { gap: 20 },
  copy: { color: '#807188', fontSize: 13, lineHeight: 23 },
  notice: { color: '#655b76', fontSize: 12, marginBottom: 10 },
  overlay: {
    flex: 1,
    backgroundColor: '#34273c63',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modal: { width: '100%', maxWidth: 354, borderRadius: 23, backgroundColor: '#fff', padding: 25 },
  modalTitle: { color: '#282636', fontSize: 20, lineHeight: 30, fontWeight: '700' },
  modalCopy: { color: '#807188', fontSize: 13, lineHeight: 23, marginTop: 12 },
  inputLabel: { color: '#9a8ba7', fontSize: 12, marginTop: 15, marginBottom: 7 },
  input: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: '#ded4e5',
    borderRadius: 11,
    paddingHorizontal: 12,
    backgroundColor: '#fbf9fd',
    color: '#4e3f5b',
    fontSize: 14,
  },
  actions: { flexDirection: 'row', gap: 9, marginTop: 22 },
  secondary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#f3f1f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  secondaryText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
  primary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#302b38',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  danger: { backgroundColor: '#fff0f0' },
  dangerText: { color: '#b56060' },
  disabled: { opacity: 0.38 },
});
