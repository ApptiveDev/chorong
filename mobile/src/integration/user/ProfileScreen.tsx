import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Me } from '../models';
import { UserStatus } from './Screen';

type Dialog = 'logout' | 'withdraw' | null;
const navy = '#273a52';

export default function ProfileScreen() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [me, setMe] = useState<Me | null>(null);
  const [nickname, setNickname] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmText, setConfirmText] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const load = () =>
    task.run(async () => {
      const result = await api.account.me();
      setMe(result);
      setNickname(result.nickname);
      return result;
    });
  useEffect(() => {
    if (session.ready && session.authenticated) void load();
  }, [session.ready, session.authenticated]);
  const save = () =>
    void task.run(async () => {
      const result = await api.account.update({ nickname: nickname.trim() });
      setMe(result);
      setNotice('닉네임이 저장됐습니다.');
    });
  const finish = () =>
    void task.run(async () => {
      if (dialog === 'logout') await api.account.logout(false);
      if (dialog === 'withdraw') await api.account.withdraw();
      setDialog(null);
      router.replace('/more');
    });
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={navy} />
          <Text style={s.backText}>제어실</Text>
        </Pressable>
        <Text style={s.title}>프로필과 계정</Text>
        <UserStatus task={task} />
        {notice ? <Text style={s.notice}>{notice}</Text> : null}
        {!session.authenticated ? (
          <>
            <Text style={s.muted}>로그인하면 프로필을 볼 수 있습니다.</Text>
            <Action title="로그인" onPress={() => router.push('/account')} />
          </>
        ) : me ? (
          <>
            <View style={s.account}>
              <Text style={s.accountName}>{me.nickname}</Text>
              <Text style={s.muted}>{me.status === 'GUEST' ? '게스트 로그인' : '회원'}</Text>
            </View>
            <Text style={s.label}>닉네임</Text>
            <TextInput
              accessibilityLabel="닉네임"
              value={nickname}
              onChangeText={setNickname}
              autoCorrect={false}
              style={s.input}
            />
            <Action
              title="닉네임 저장"
              disabled={task.busy || !nickname.trim() || nickname.trim() === me.nickname}
              onPress={save}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              onPress={() => setDetailsOpen((value) => !value)}
              style={s.detailsToggle}
            >
              <Text style={s.label}>계정 정보</Text>
              <Ionicons
                name={detailsOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#7b8795"
              />
            </Pressable>
            {detailsOpen ? (
              <View style={s.account}>
                <Text style={s.muted}>
                  완료한 레슨 {me.progress.completedLessons}/{me.progress.totalLessons}
                </Text>
                <Text style={s.muted}>
                  별 {me.wallet.star} · 별가루 {me.wallet.stardust}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {session.authenticated ? (
        <View style={s.footer}>
          <Outline title="로그아웃" onPress={() => setDialog('logout')} />
          {session.user?.status === 'ACTIVE' ? (
            <Outline
              title="회원 탈퇴"
              danger
              onPress={() => {
                setConfirmText('');
                setDialog('withdraw');
              }}
            />
          ) : null}
        </View>
      ) : null}
      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>
              {dialog === 'logout' ? '로그아웃할까요?' : '회원 탈퇴'}
            </Text>
            <Text style={s.muted}>
              {dialog === 'logout'
                ? '로그아웃하면 다시 로그인해야 합니다.'
                : '탈퇴하면 계정 데이터가 삭제됩니다. 계속하려면 아래에 탈퇴를 입력하세요.'}
            </Text>
            {dialog === 'withdraw' ? (
              <TextInput
                accessibilityLabel="탈퇴 확인 입력"
                placeholder="탈퇴"
                value={confirmText}
                onChangeText={setConfirmText}
                style={s.input}
              />
            ) : null}
            <Action
              title={dialog === 'logout' ? '로그아웃' : '탈퇴 확인'}
              disabled={task.busy || (dialog === 'withdraw' && confirmText !== '탈퇴')}
              onPress={finish}
            />
            <Outline title="취소" onPress={() => setDialog(null)} />
            <UserStatus task={task} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.primary, disabled && s.disabled]}
    >
      <Text style={s.primaryText}>{title}</Text>
    </Pressable>
  );
}
function Outline({
  title,
  onPress,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.outline}>
      <Text style={[s.outlineText, danger && s.danger]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 18, gap: 11, flexGrow: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
  backText: { fontSize: 12, color: navy },
  title: { textAlign: 'center', color: navy, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  account: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    backgroundColor: '#f8f9fb',
    borderRadius: 5,
    padding: 14,
    gap: 3,
  },
  accountName: { color: navy, fontSize: 14, fontWeight: '700' },
  label: { color: navy, fontSize: 12, fontWeight: '600' },
  muted: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 10,
    color: navy,
    fontSize: 13,
  },
  primary: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  detailsToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 7,
  },
  footer: { paddingHorizontal: 18, paddingBottom: 16, gap: 6, backgroundColor: '#fff' },
  outline: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { color: navy, fontSize: 12 },
  danger: { color: '#ad6262' },
  notice: { color: navy, fontSize: 12 },
  overlay: { flex: 1, backgroundColor: '#273a5299', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 6, padding: 17, gap: 10 },
  modalTitle: { color: navy, fontSize: 16, fontWeight: '700' },
});
