// Figma M05_1 모달 · 소셜 로그인. 비회원에게 소셜 로그인을 권하는 모달이며 쓰는 곳마다 제목·안내만 다르다.
// - 656:4175 온보딩 첫 학습 완료 화면의 '완료'(FirstStudyLoginModal)
// - 656:4211 제어실 '로그인'(SaveRecordLoginModal)
// - 비회원이 우주선(하우징)에 들어가려 할 때(HousingLoginModal). 문구는 디자인 시안 스크린샷을 따른다.
// '나중에 하기'는 비회원 세션을 그대로 두고 닫는다.
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIntegration, useTask } from '../hooks';
import { continueWithSocial, type SocialProvider } from './SocialLoginScreen';

const googleLetters = [
  ['구', '#0038df'],
  ['글', '#ca1310'],
  ['로', '#f0a90e'],
  [' ', '#000000'],
  ['계', '#0038df'],
  ['속', '#009838'],
  ['하', '#ca1310'],
  ['기', '#f0a90e'],
] as const;

type LoginModalProps = {
  visible: boolean;
  // '나중에 하기'. 비회원으로 남는다.
  onLater: () => void;
  // 약관 화면으로 이동하기 전에 모달을 닫는다. 돌아오면 다시 열 수 있다.
  onDismiss: () => void;
  // 로그인에 성공한 뒤 할 일.
  onSignedIn: () => void;
};

// 656:4175. 온보딩 첫 학습 완료 화면에서 '완료'를 누르면 띄운다.
export function FirstStudyLoginModal(props: LoginModalProps) {
  return (
    <SocialLoginModal
      {...props}
      title="첫 학습을 기록할까요?"
      lines={['가입하면 처음 밝힌 별과', '첫 학습 기록을 저장할 수 있어요.']}
    />
  );
}

// 656:4211. 비회원 제어실에서 '로그인'을 누르면 띄운다.
export function SaveRecordLoginModal(props: LoginModalProps) {
  return (
    <SocialLoginModal
      {...props}
      title="학습 기록을 저장할까요?"
      lines={['가입하면 지금까지 밝힌 별과', '학습 기록을 이어갈 수 있어요.']}
    />
  );
}

// 비회원이 우주선 탭·꾸미기 화면에 들어가려 하면 띄운다. 비회원은 하우징에 들어갈 수 없다.
export function HousingLoginModal(props: LoginModalProps) {
  return (
    <SocialLoginModal
      {...props}
      title="로그인하고 내 우주선을 꾸며보세요"
      lines={['로그인하면 내 우주선을 꾸밀 수 있고,', '지금까지의 학습 기록도 계정에 저장돼요.']}
      bodyWidth={244}
      // 시안은 제목이 한 줄이다. 24 로는 290 폭에서 줄바꿈되어 18 로 줄인다.
      titleSize={18}
    />
  );
}

function SocialLoginModal({
  visible,
  title,
  lines,
  // 안내 문구 폭. Figma 656:4175·656:4211 은 201 이다. 긴 문구는 내용 폭(300) 안에서 넓힌다.
  bodyWidth = 201,
  titleSize = 24,
  onLater,
  onDismiss,
  onSignedIn,
}: LoginModalProps & {
  title: string;
  lines: readonly [string, string];
  bodyWidth?: number;
  titleSize?: number;
}) {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const leaving = useRef(false);

  const signIn = (provider: SocialProvider) => {
    if (task.busy || leaving.current) return;
    void task.run(async () => {
      if (!(await continueWithSocial(provider, session.authenticated))) return;
      leaving.current = true;
      onSignedIn();
    });
  };
  const later = () => {
    if (task.busy || leaving.current) return;
    onLater();
  };
  const openLegal = (path: '/settings/terms' | '/settings/privacy') => {
    if (task.busy || leaving.current) return;
    onDismiss();
    router.push(path);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={later}>
      <View style={s.overlay}>
        <View style={s.modal} accessibilityViewIsModal>
          <View style={s.copy}>
            <View style={s.titleWrap}>
              <Text style={[s.title, { fontSize: titleSize }]}>{title}</Text>
            </View>
            <View style={s.bodyRow}>
              <Text style={s.bullet}>{'>'}</Text>
              <View style={[s.body, { width: bodyWidth }]}>
                <Text style={[s.bodyText, s.bodyFirstLine]}>{lines[0]}</Text>
                <Text style={s.bodyText} numberOfLines={1} adjustsFontSizeToFit>
                  {lines[1]}
                </Text>
              </View>
            </View>
          </View>
          <View style={s.actions}>
            <View style={s.buttons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="애플로 계속하기"
                disabled={task.busy}
                onPress={() => signIn('apple')}
                style={[s.button, s.apple, task.busy && s.disabled]}
              >
                <Text style={[s.buttonText, s.appleText]}>애플로 계속하기</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="구글로 계속하기"
                disabled={task.busy}
                onPress={() => signIn('google')}
                style={[s.button, s.google, task.busy && s.disabled]}
              >
                <Text style={s.buttonText}>
                  {googleLetters.map(([letter, color], index) => (
                    <Text key={index} style={{ color }}>
                      {letter}
                    </Text>
                  ))}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="카카오로 계속하기"
                disabled={task.busy}
                onPress={() => signIn('kakao')}
                style={[s.button, s.kakao, task.busy && s.disabled]}
              >
                <Text style={s.buttonText}>카카오로 계속하기</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" disabled={task.busy} onPress={later} hitSlop={8}>
              <Text style={s.later}>나중에 하기</Text>
            </Pressable>
            <View style={s.legal}>
              <Pressable accessibilityRole="link" onPress={() => openLegal('/settings/terms')}>
                <Text style={s.legalText}>이용약관</Text>
              </Pressable>
              <Text style={s.legalText}>{' · '}</Text>
              <Pressable accessibilityRole="link" onPress={() => openLegal('/settings/privacy')}>
                <Text style={s.legalText}>개인정보 처리방침</Text>
              </Pressable>
            </View>
            {task.busy ? (
              <ActivityIndicator accessibilityLabel="로그인 중" color="#161616" />
            ) : null}
            {task.error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {task.error}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Figma 노드에는 배경 레이어가 없어 프로젝트 모달 공통 반투명 배경(#161616 50%)을 쓴다.
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#16161680',
  },
  // 342 폭(좌우 20 + 내용 300), 위아래 28, 배경 #f1f1f1, 테두리 1 #000, 모서리 8
  modal: {
    width: '100%',
    maxWidth: 342,
    alignItems: 'center',
    gap: 24,
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 8,
  },
  copy: { width: '100%', gap: 28 },
  titleWrap: { width: '100%', alignItems: 'center', paddingVertical: 12 },
  title: { color: '#000000', fontFamily: 'PretendardSemiBold', fontSize: 24, textAlign: 'center' },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
  },
  bullet: {
    flexShrink: 0,
    color: '#000000',
    fontFamily: 'KkakdugiRegular',
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  body: { width: 201, flexShrink: 1 },
  bodyText: {
    color: '#000000',
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 18,
    includeFontPadding: false,
  },
  bodyFirstLine: { marginBottom: 4 },
  actions: { width: '100%', maxWidth: 300, alignItems: 'center', gap: 24 },
  buttons: { width: '100%', gap: 12 },
  button: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 4,
  },
  apple: { backgroundColor: '#161616', borderColor: '#f1f1f1' },
  google: { backgroundColor: '#f1f1f1', borderColor: '#161616' },
  kakao: { backgroundColor: '#ffdc2e', borderColor: '#161616' },
  buttonText: { color: '#161616', fontFamily: 'PretendardRegular', fontSize: 16 },
  appleText: { color: '#f1f1f1' },
  disabled: { opacity: 0.5 },
  later: { color: '#747474', fontFamily: 'PretendardRegular', fontSize: 16, textAlign: 'center' },
  legal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  legalText: { color: '#747474', fontFamily: 'PretendardLight', fontSize: 14 },
  error: { color: '#b00030', fontFamily: 'PretendardRegular', fontSize: 13, textAlign: 'center' },
});
