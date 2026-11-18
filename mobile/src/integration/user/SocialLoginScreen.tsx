import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIntegration, useTask } from '../hooks';
import { GoogleButtonOverlay } from '../GoogleButtonOverlay';
import { signInWithGoogle } from '../googleSignIn';
import type { OAuthCredential } from '../models';
import { devicePlatform, integrationApi as api, useMockApi } from '../runtime';
import { AuthResultModal } from './AuthResultModals';
import { socialLoginErrorModal, type SocialLoginModalKind } from './socialLoginResult';
import { firstStudyRoute } from './welcomeFlow';

export type SocialProvider = 'apple' | 'google' | 'kakao';

export type SocialLoginOptions = {
  // 앞 요청에서 받은 자격 증명. M02_8 재요청에서 계정 선택 창을 다시 띄우지 않으려고 쓴다.
  credential?: OAuthCredential;
  // M02_8 '기존 계정으로 로그인'. 서버 미구현이라 지금은 ERR-14 가 그대로 돌아온다(api.ts).
  switchToExisting?: boolean;
  // 소셜 자격 증명을 받은 직후 호출한다. 재요청에 쓸 수 있게 보관한다.
  onCredential?: (credential: OAuthCredential) => void;
};
// isNew: 세션 토큰 없이 로그인해 서버가 새 회원을 만들었는지(API-105 AuthResponse).
export type SocialLoginResult = { isNew: boolean };

// 소셜 계속하기 공용 처리. 로그인 화면과 소셜 로그인 모달이 같이 쓴다(useSocialLogin).
// 사용자가 소셜 로그인을 취소하면 null 을 돌려준다. 서버 오류는 그대로 던진다.
export async function continueWithSocial(
  provider: SocialProvider,
  authenticated: boolean,
  { credential, switchToExisting = false, onCredential }: SocialLoginOptions = {},
): Promise<SocialLoginResult | null> {
  if (provider === 'google' || useMockApi) {
    // 게스트로 로그인한 상태면 서버가 현재 계정에 소셜 수단을 연결한다.
    let next = credential;
    if (!next) {
      if (provider === 'google') {
        const idToken = await signInWithGoogle();
        if (!idToken) return null;
        next = { idToken };
      } else next = { accessToken: 'mock-social-login' };
    }
    onCredential?.(next);
    const auth = await api.account.oauthLogin(provider, {
      ...next,
      ...(switchToExisting ? { switchToExisting: true } : {}),
    });
    return { isNew: auth.isNew };
  }
  if (!authenticated) {
    await api.account.guest(devicePlatform());
  }
  // 애플·카카오는 아직 실제 연동 전이라 비회원 세션으로 대신한다. 새 회원이 아니다.
  return { isNew: false };
}

type SocialAttempt = {
  provider: SocialProvider;
  credential?: OAuthCredential;
  switchToExisting: boolean;
};

// 소셜 로그인과 결과 모달(M01_3·M02_7·M02_8·M02_9)을 묶는다. 로그인 화면과 소셜 로그인 모달이 같이 쓴다.
// 실패는 모두 모달로 보여 주므로 task.error 는 쓰지 않는다. 취소는 모달 없이 끝낸다.
export function useSocialLogin({
  onSignedIn,
  noAccountWhenNew = false,
}: {
  onSignedIn: (result: SocialLoginResult) => void;
  // 기존 계정으로 로그인하러 왔는데 서버가 새 회원을 만들었으면 바로 넘어가지 않고 M01_3 을 띄운다.
  noAccountWhenNew?: boolean;
}) {
  const router = useRouter();
  const session = useIntegration();
  const task = useTask();
  const [modal, setModal] = useState<SocialLoginModalKind | null>(null);
  const attempt = useRef<SocialAttempt | null>(null);
  const newMember = useRef<SocialLoginResult>({ isNew: true });

  const run = (next: SocialAttempt) => {
    if (task.busy) return;
    attempt.current = next;
    setModal(null);
    const guest = session.authenticated && session.user?.status === 'GUEST';
    if (__DEV__) console.log(`[social] start provider=${next.provider} guest=${guest}`);
    void task.run(async () => {
      try {
        const result = await continueWithSocial(next.provider, session.authenticated, {
          credential: next.credential,
          switchToExisting: next.switchToExisting,
          onCredential: (credential) => {
            next.credential = credential;
          },
        });
        if (__DEV__)
          console.log(`[social] result provider=${next.provider} isNew=${result?.isNew}`);
        if (!result) return;
        if (noAccountWhenNew && result.isNew) {
          newMember.current = result;
          setModal('noAccount');
          return;
        }
        onSignedIn(result);
        if (__DEV__) console.log('[social] signedIn done');
      } catch (error) {
        if (__DEV__)
          console.log(`[social] error ${error instanceof Error ? error.message : error}`);
        setModal(
          socialLoginErrorModal(error, { guest, switchingToExisting: next.switchToExisting }),
        );
      }
    });
  };
  const close = () => {
    if (task.busy) return;
    setModal(null);
    // M01_3 을 닫아도 새 계정은 이미 만들어졌으므로 로그인 뒤 흐름을 이어 간다.
    if (modal === 'noAccount') onSignedIn(newMember.current);
  };
  // 다시 시도는 자격 증명을 새로 받는다. 만료된 토큰을 다시 보내지 않기 위해서다.
  const retry = () => {
    if (attempt.current) run({ ...attempt.current, credential: undefined });
  };
  // 사용자가 방금 고른 계정 그대로 다시 보낸다. 계정 선택 창을 다시 띄우지 않는다.
  const switchToExisting = () => {
    if (attempt.current) run({ ...attempt.current, switchToExisting: true });
  };
  const startFirstStudy = () => {
    if (task.busy) return;
    void task.run(async () => {
      const route = await firstStudyRoute(api.learning);
      setModal(null);
      router.replace(route ?? '/');
    });
  };

  return {
    busy: task.busy,
    signIn: (provider: SocialProvider) => run({ provider, switchToExisting: false }),
    // 웹은 Google 버튼이 idToken 을 직접 돌려준다. 그 값으로 바로 로그인한다.
    signInWithGoogleToken: (idToken: string) =>
      run({ provider: 'google', credential: { idToken }, switchToExisting: false }),
    showError: (error: unknown) =>
      setModal(socialLoginErrorModal(error, { guest: false, switchingToExisting: false })),
    modal: (
      <AuthResultModal
        kind={modal}
        busy={task.busy}
        onClose={close}
        onRetry={retry}
        onSwitchToExisting={switchToExisting}
        onStartFirstStudy={startFirstStudy}
      />
    ),
  };
}

const googleLetters = [
  ['G', '#0038df'],
  ['o', '#ca1310'],
  ['o', '#f0a90e'],
  ['g', '#0038df'],
  ['l', '#009838'],
  ['e', '#ca1310'],
  ['로', '#f0a90e'],
  [' ', '#161616'],
  ['계', '#0038df'],
  ['속', '#009838'],
  ['하', '#ca1310'],
  ['기', '#f0a90e'],
] as const;

export default function SocialLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const topSpacing = Math.max(0, 52 - insets.top);
  const contentHeight = height - insets.top - insets.bottom - topSpacing;
  const headerToButtons = Math.max(24, Math.min(280, contentHeight - 29 - 227 - 24));
  // entry=existing: 웰컴 '기존 계정으로 로그인'에서 왔다(WelcomeScreen).
  const { returnTo, entry } = useLocalSearchParams<{ returnTo?: string; entry?: string }>();
  const afterLogin = returnTo === '/social' ? '/social' : '/';
  const session = useIntegration();
  const login = useSocialLogin({
    onSignedIn: () => router.replace(afterLogin),
    noAccountWhenNew: entry === 'existing' && !session.authenticated,
  });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={[s.header, { marginTop: topSpacing }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          onPress={() => router.back()}
        >
          <Text allowFontScaling={false} style={s.back}>
            ‹
          </Text>
        </Pressable>
        <Text allowFontScaling={false} style={s.title}>
          로그인
        </Text>
      </View>
      <View style={s.center}>
        <View style={[s.panel, { marginTop: headerToButtons }]}>
          <View style={s.buttons}>
            <SocialButton provider="apple" disabled={login.busy} onPress={login.signIn} />
            <SocialButton
              provider="google"
              disabled={login.busy}
              onPress={login.signIn}
              webWidth={328}
              onGoogleToken={login.signInWithGoogleToken}
              onGoogleError={(message) => login.showError(new Error(message))}
            />
            <SocialButton provider="kakao" disabled={login.busy} onPress={login.signIn} />
          </View>
          <View style={s.legal}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/settings/terms')}>
              <Text allowFontScaling={false} style={s.legalText}>
                이용약관
              </Text>
            </Pressable>
            <Text allowFontScaling={false} style={s.legalText}>
              {' · '}
            </Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/settings/privacy')}>
              <Text allowFontScaling={false} style={s.legalText}>
                개인정보 처리방침
              </Text>
            </Pressable>
          </View>
          {login.busy ? <ActivityIndicator accessibilityLabel="로그인 중" color="#f1f1f1" /> : null}
        </View>
      </View>
      {login.modal}
    </SafeAreaView>
  );
}

function SocialButton({
  provider,
  disabled,
  onPress,
  webWidth,
  onGoogleToken,
  onGoogleError,
}: {
  provider: SocialProvider;
  disabled: boolean;
  onPress: (provider: SocialProvider) => void;
  webWidth?: number;
  onGoogleToken?: (idToken: string) => void;
  onGoogleError?: (message: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${provider.toUpperCase()}로 계속하기`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPress(provider)}
      style={[s.button, s[provider], disabled && s.disabled]}
    >
      {provider === 'google' ? (
        <Text allowFontScaling={false} style={s.buttonText}>
          {googleLetters.map(([letter, color], index) => (
            <Text key={index} style={{ color }}>
              {letter}
            </Text>
          ))}
        </Text>
      ) : (
        <Text allowFontScaling={false} style={[s.buttonText, provider === 'apple' && s.appleText]}>
          {provider === 'apple' ? 'APPLE로 계속하기' : 'KAKAO로 계속하기'}
        </Text>
      )}
      {provider === 'google' && webWidth && onGoogleToken && onGoogleError ? (
        <GoogleButtonOverlay
          width={webWidth}
          disabled={disabled}
          onIdToken={onGoogleToken}
          onError={onGoogleError}
        />
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#161616' },
  header: {
    height: 29,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'flex-start',
  },
  back: {
    color: '#f1f1f1',
    fontFamily: 'PretendardBold',
    fontSize: 28,
    lineHeight: 29,
    textShadowColor: '#f1f1f1',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  title: { color: '#f1f1f1', fontFamily: 'PretendardBold', fontSize: 24, lineHeight: 29 },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 32 },
  panel: { width: '100%', maxWidth: 328, alignItems: 'center', gap: 42 },
  buttons: { width: '100%', gap: 12 },
  button: {
    height: 48,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apple: { backgroundColor: '#161616', borderColor: '#f1f1f1' },
  google: { backgroundColor: '#f1f1f1', borderColor: '#161616' },
  kakao: { backgroundColor: '#ffdc2e', borderColor: '#161616' },
  buttonText: { color: '#161616', fontFamily: 'PretendardRegular', fontSize: 16, lineHeight: 19 },
  appleText: { color: '#f1f1f1' },
  legal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  legalText: { color: '#f1f1f1', fontFamily: 'PretendardLight', fontSize: 14, lineHeight: 17 },
  disabled: { opacity: 0.5 },
});
