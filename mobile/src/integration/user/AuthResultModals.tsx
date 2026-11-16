// 소셜 로그인 결과 모달 4종. 버튼 2개는 공용 SessionConfirmModal, 버튼 1개(M01_3)는
// ReviewEmptyModal 과 같은 공용 틀(Frame·DialogButton)을 쓴다. 띄우는 조건은 socialLoginResult.ts 와
// useSocialLogin(SocialLoginScreen.tsx)에 있다.
import { StyleSheet, Text, View } from 'react-native';
import { Bullet, DialogButton, Frame } from './HousingConfirmModals';
import { SessionConfirmModal } from './SessionConfirmModal';
import type { SocialLoginModalKind } from './socialLoginResult';

export function AuthResultModal({
  kind,
  busy,
  onClose,
  onRetry,
  onSwitchToExisting,
  onStartFirstStudy,
}: {
  kind: SocialLoginModalKind | null;
  busy: boolean;
  // '닫기'·'취소'·뒤로 가기.
  onClose: () => void;
  // M02_7·M02_9 '다시 시도'.
  onRetry: () => void;
  // M02_8 '기존 계정으로 로그인'.
  onSwitchToExisting: () => void;
  // M01_3 '첫 학습 시작하기'.
  onStartFirstStudy: () => void;
}) {
  return (
    <>
      <NoAccountModal
        visible={kind === 'noAccount'}
        busy={busy}
        onClose={onClose}
        onStart={onStartFirstStudy}
      />
      {/* M02_7 인증 실패 */}
      <SessionConfirmModal
        visible={kind === 'authFailed'}
        title="로그인하지 못했어요."
        notice="잠시 뒤 다시 시도해 주세요."
        cancelLabel="닫기"
        confirmLabel="다시 시도"
        arrowBullet
        busy={busy}
        onCancel={onClose}
        onConfirm={onRetry}
      />
      {/* M02_8 기록 저장 중 기존 계정 발견. 확인 문구가 길어 버튼을 세로로 쌓는다. */}
      <SessionConfirmModal
        visible={kind === 'switchAccount'}
        title="기존 계정으로 로그인할까요?"
        notice="이 기기에서 비회원으로 학습한 기록은 기존 계정에 합쳐지지 않아요."
        cancelLabel="취소"
        confirmLabel="기존 계정으로 로그인"
        arrowBullet
        stacked
        busy={busy}
        onCancel={onClose}
        onConfirm={onSwitchToExisting}
      />
      {/* M02_9 기록 승계 실패 */}
      <SessionConfirmModal
        visible={kind === 'migrationFailed'}
        title="학습 기록을 옮기지 못했어요."
        notice="다시 시도해 주세요."
        cancelLabel="닫기"
        confirmLabel="다시 시도"
        arrowBullet
        busy={busy}
        onCancel={onClose}
        onConfirm={onRetry}
      />
    </>
  );
}

// M01_3 기존 계정 없음. 버튼 1개라 SessionConfirmModal 대신 ReviewEmptyModal 과 같은 틀을 쓴다.
function NoAccountModal({
  visible,
  busy,
  onClose,
  onStart,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  return (
    <Frame
      visible={visible}
      onRequestClose={() => !busy && onClose()}
      padding={{ horizontal: 28, vertical: 28 }}
      borderColor="#000000"
    >
      <View style={s.content}>
        <View style={s.message}>
          <View style={s.heading}>
            <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit>
              연결된 기존 계정이 없어요.
            </Text>
          </View>
          <View style={s.notice}>
            <Bullet />
            <Text style={s.copy}>
              이 소셜 계정으로 가입한 기록이 없어요. 첫 학습을 바로 시작해 볼 수 있어요.
            </Text>
          </View>
        </View>
        <DialogButton
          label="첫 학습 시작하기"
          primary
          bordered={false}
          disabled={busy}
          style={s.button}
          onPress={onStart}
        />
      </View>
    </Frame>
  );
}

// 치수는 ReviewEmptyModal(Figma 342:632)과 같다.
const s = StyleSheet.create({
  content: { width: '100%', maxWidth: 300, gap: 16, alignItems: 'center' },
  message: { width: '100%', gap: 16, alignItems: 'center' },
  heading: { maxWidth: '100%', paddingVertical: 8 },
  title: {
    maxWidth: '100%',
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  notice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 12,
  },
  copy: {
    flexShrink: 1,
    color: '#161616',
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 18,
    includeFontPadding: false,
  },
  button: { width: '100%' },
});
