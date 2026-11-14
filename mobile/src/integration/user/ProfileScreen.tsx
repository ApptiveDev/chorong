import { useEffect, useRef, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackArrow } from '../../components/settings/ControlSettingsUI';
import Svg, { Path } from 'react-native-svg';
import { AppButton } from '../../components/AppButton';
import { client, integrationApi as api, useMockApi } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Me } from '../models';
import { nicknameValidationError } from './profileNickname';
import { SessionConfirmModal } from './SessionConfirmModal';

const providerLabels: Record<string, string> = {
  EMAIL: '이메일 로그인',
  GOOGLE: '구글 로그인',
  KAKAO: '카카오 로그인',
  APPLE: 'Apple 로그인',
};
type Action = 'load' | 'save' | 'logout' | 'withdraw' | null;
type ButtonKind = 'logout' | 'withdraw';

export default function ProfileScreen() {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const inputRef = useRef<TextInput>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [draft, setDraft] = useState('');
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const member = session.authenticated && session.user?.status === 'ACTIVE';
  const profile = me ?? (session.user && 'providers' in session.user ? session.user : null);
  const currentNickname = profile?.nickname ?? session.user?.nickname ?? '';
  const provider = profile?.providers.find((item) => item !== 'GUEST');
  const providerLabel = provider ? (providerLabels[provider] ?? provider) : '—';
  const taskError = task.error?.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\(HTTP \d+\)$/, '');

  useEffect(() => {
    if (!session.ready || !member) return;
    setAction('load');
    void task.run(async () => {
      const result = await api.account.me();
      setMe(result);
      return result;
    });
  }, [session.ready, member]);

  const beginEditing = () => {
    if (task.busy) return;
    setAction(null);
    setDraft(currentNickname);
    setEditError('');
    setNicknameOpen(true);
  };
  const closeNickname = () => {
    if (task.busy) return;
    Keyboard.dismiss();
    setNicknameOpen(false);
    setDraft('');
    setEditError('');
    setAction(null);
  };
  const saveNickname = () => {
    if (!nicknameOpen || task.busy) return;
    const next = draft.trim();
    if (next === currentNickname) {
      closeNickname();
      return;
    }
    const error = nicknameValidationError(next);
    if (error) {
      setEditError(error);
      return;
    }
    setAction('save');
    setEditError('');
    void task.run(async () => {
      const result = await api.account.update({ nickname: next });
      setMe(result);
      setDraft(result.nickname);
      setNicknameOpen(false);
      Keyboard.dismiss();
      return result;
    });
  };
  const closeLogout = () => {
    if (task.busy) return;
    setLogoutOpen(false);
    setAction(null);
  };
  const closeWithdraw = () => {
    if (task.busy) return;
    setWithdrawOpen(false);
    setAction(null);
  };
  const finish = (kind: ButtonKind) => {
    if (task.busy) return;
    setAction(kind);
    setEndingSession(true);
    void task.run(async () => {
      try {
        if (kind === 'logout') await api.account.logout(false);
        else await api.account.withdraw();
      } catch (error) {
        setEndingSession(false);
        throw error;
      }
      if (kind === 'logout') setLogoutOpen(false);
      setWithdrawOpen(false);
      const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : null;
      if (platform || useMockApi) {
        try {
          await api.account.guest(platform ?? 'ANDROID');
          if (client.getSnapshot().user?.status !== 'GUEST') {
            await api.account.logout(false);
            await client.renewGuestDeviceUuid();
            await api.account.guest(platform ?? 'ANDROID');
          }
          if (client.getSnapshot().user?.status !== 'GUEST') {
            throw new Error('비회원 세션을 만들지 못했습니다.');
          }
          router.replace('/more');
          return;
        } catch (error) {
          if (client.getSnapshot().user?.status === 'ACTIVE') {
            setEndingSession(false);
            throw error;
          }
          Alert.alert(
            '비회원 연결 실패',
            '로그인 정보는 정리되었습니다. 시작 화면에서 다시 시도해 주세요.',
          );
        }
      }
      router.replace('/welcome');
    });
  };

  if (!session.ready)
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator accessibilityLabel="계정 확인 중" style={s.loading} />
      </SafeAreaView>
    );
  if (!member && !endingSession) return <Redirect href="/more" />;
  if (endingSession || !member)
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator accessibilityLabel="비회원 전환 중" style={s.loading} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={s.safe} edges={['top', 'right', 'bottom', 'left']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.content,
            {
              // 헤더 상단 여백: Safe Area 아래 32 (우주선 관리하기·알림과 동일).
              paddingTop: 32,
              // 하단 내비게이션 바(Safe Area) 위로 52 를 띄운다.
              paddingBottom: 52,
            },
          ]}
        >
          <View style={s.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="제어실로 돌아가기"
              onPress={() => router.replace('/more')}
              style={s.back}
            >
              <BackArrow />
            </Pressable>
            <Text style={s.title}>프로필과 계정</Text>
          </View>
          <View style={s.center}>
            <View style={s.profileBlock}>
              <View style={s.profileCard}>
                <Image
                  accessibilityLabel="초롱이 프로필 사진"
                  source={require('../../../assets/control-room-member-profile.png')}
                  resizeMode="cover"
                  style={s.profileImage}
                />
                <View style={s.cardInfo}>
                  <View style={s.cardLine}>
                    <Text style={s.cardLabel}>Name</Text>
                    <Text numberOfLines={1} style={s.cardName}>
                      {currentNickname}
                    </Text>
                  </View>
                  <View style={s.cardLine}>
                    <Text style={s.cardLabel}>Login</Text>
                    <Text numberOfLines={1} style={s.cardProvider}>
                      {providerLabel}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={s.nicknameBlock}>
                <View style={s.nicknameHeading}>
                  <Text style={s.nicknameTitle}>닉네임 변경</Text>
                  <Text style={s.nicknameHint}>한글·영문·숫자 2~12자</Text>
                </View>
                <View style={s.inputBox}>
                  <Text numberOfLines={1} style={s.inputValue}>
                    {currentNickname}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="닉네임 수정"
                    accessibilityState={{ disabled: task.busy }}
                    disabled={task.busy}
                    onPress={beginEditing}
                    style={s.inputAction}
                  >
                    <Svg width={18} height={18} viewBox="0 0 18.0024 18.0024" fill="none">
                      <Path
                        d="M0 14.2524V18.0024H3.75L14.81 6.94244L11.06 3.19244L0 14.2524ZM17.71 4.04244C17.8027 3.94993 17.8762 3.84004 17.9264 3.71907C17.9766 3.59809 18.0024 3.46841 18.0024 3.33744C18.0024 3.20648 17.9766 3.07679 17.9264 2.95582C17.8762 2.83485 17.8027 2.72496 17.71 2.63244L15.37 0.292444C15.2775 0.19974 15.1676 0.126193 15.0466 0.0760114C14.9257 0.02583 14.796 0 14.665 0C14.534 0 14.4043 0.02583 14.2834 0.0760114C14.1624 0.126193 14.0525 0.19974 13.96 0.292444L12.13 2.12244L15.88 5.87244L17.71 4.04244Z"
                        fill="#AAAAAA"
                      />
                    </Svg>
                  </Pressable>
                </View>
                {action === 'load' && taskError ? (
                  <Text accessibilityRole="alert" style={s.error}>
                    {taskError}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
          <View style={s.bottomActions}>
            <AppButton
              title="로그아웃"
              variant="light"
              loading={task.busy}
              onPress={() => {
                if (task.busy) return;
                setAction(null);
                setLogoutOpen(true);
              }}
            />
            <AppButton
              title="회원탈퇴"
              variant="danger"
              loading={task.busy}
              onPress={() => {
                if (task.busy) return;
                setAction(null);
                setWithdrawOpen(true);
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={nicknameOpen} transparent animationType="fade" onRequestClose={closeNickname}>
        <KeyboardAvoidingView
          style={s.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.nicknameModal}>
            <View style={s.nicknameModalHeading}>
              <Text style={s.nicknameModalTitle}>닉네임 변경</Text>
            </View>
            <TextInput
              ref={inputRef}
              accessibilityLabel="새 닉네임"
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                setEditError('');
                setAction(null);
              }}
              onSubmitEditing={saveNickname}
              editable={!task.busy}
              returnKeyType="done"
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={12}
              style={s.nicknameModalInput}
            />
            <Text
              accessibilityRole={
                editError || (action === 'save' && taskError) ? 'alert' : undefined
              }
              style={[
                s.nicknameModalHint,
                (editError || (action === 'save' && taskError)) && s.nicknameModalError,
              ]}
            >
              {editError || (action === 'save' && taskError) || '한글·영문·숫자 2~12자'}
            </Text>
            <View style={s.nicknameModalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: task.busy }}
                disabled={task.busy}
                onPress={closeNickname}
                style={s.nicknameModalCancel}
              >
                <Text style={s.nicknameModalCancelText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: task.busy }}
                disabled={task.busy}
                onPress={saveNickname}
                style={s.nicknameModalSave}
              >
                <Text style={s.nicknameModalSaveText}>저장</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <SessionConfirmModal
        visible={logoutOpen}
        title="로그아웃 할까요 ?"
        notice="로그아웃하면 일부 기능을 이용할 수 없어요."
        confirmLabel="로그아웃"
        error={action === 'logout' ? taskError : null}
        busy={task.busy}
        onCancel={closeLogout}
        onConfirm={() => finish('logout')}
      />
      <SessionConfirmModal
        visible={withdrawOpen}
        title="회원 탈퇴"
        notice={
          '탈퇴하면 학습 기록, 별가루, 꾸민 우주선은 다시 이용할 수 없어요.\n탈퇴는 되돌릴 수 없어요.'
        }
        confirmLabel="탈퇴 요청"
        error={action === 'withdraw' ? taskError : null}
        busy={task.busy}
        onCancel={closeWithdraw}
        onConfirm={() => finish('withdraw')}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#e4e4e4' },
  loading: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 32 },
  header: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 14, height: 29, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#161616', fontFamily: 'PretendardBold', fontSize: 24, lineHeight: 29 },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    alignItems: 'center',
    minHeight: 280,
  },
  profileBlock: { width: '100%', maxWidth: 320 },
  profileCard: {
    flexDirection: 'row',
    width: '100%',
    height: 112,
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 4,
    overflow: 'hidden',
  },
  profileImage: { width: 99, height: 110 },
  cardInfo: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#d9d9d9',
    borderLeftWidth: 1,
    borderLeftColor: '#161616',
    paddingHorizontal: 16,
    paddingVertical: 26,
    justifyContent: 'center',
    gap: 6,
  },
  cardLine: {
    minWidth: 0,
    width: 176,
    maxWidth: '100%',
    height: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardLabel: { color: '#161616', fontFamily: 'TekoRegular', fontSize: 16, lineHeight: 21 },
  cardName: {
    flexShrink: 1,
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    fontSize: 16,
    lineHeight: 20,
  },
  cardProvider: {
    flexShrink: 1,
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    fontSize: 14,
    lineHeight: 18,
  },
  nicknameBlock: { marginTop: 40 },
  nicknameHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nicknameTitle: { color: '#161616', fontFamily: 'PretendardMedium', fontSize: 14, lineHeight: 17 },
  nicknameHint: { color: '#4f4f4f', fontFamily: 'PretendardRegular', fontSize: 12, lineHeight: 15 },
  inputBox: {
    height: 40,
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 4,
  },
  inputValue: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    color: '#161616',
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    lineHeight: 17,
  },
  inputAction: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  nicknameModal: {
    width: '100%',
    maxWidth: 342,
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 8,
    padding: 20,
  },
  nicknameModalHeading: { height: 45, paddingLeft: 12, paddingTop: 8 },
  nicknameModalTitle: {
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    fontSize: 24,
    lineHeight: 29,
  },
  nicknameModalInput: {
    height: 40,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#aaaaaa',
    borderRadius: 8,
    color: '#747474',
    fontFamily: 'PretendardMedium',
    fontSize: 14,
    lineHeight: 17,
  },
  nicknameModalHint: {
    minHeight: 17,
    marginTop: 8,
    color: '#747474',
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    lineHeight: 17,
  },
  nicknameModalError: { color: '#b42342' },
  nicknameModalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  nicknameModalCancel: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 4,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameModalCancelText: { color: '#161616', fontFamily: 'PretendardRegular', fontSize: 16 },
  nicknameModalSave: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 4,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameModalSaveText: { color: '#f1f1f1', fontFamily: 'PretendardRegular', fontSize: 16 },
  error: {
    color: '#b42342',
    fontFamily: 'PretendardRegular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  bottomActions: { width: '100%', maxWidth: 312, gap: 13 },
  overlay: {
    flex: 1,
    backgroundColor: '#16161680',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
