import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIntegration, useTask } from '../hooks';
import { integrationApi as api, useMockApi } from '../runtime';

export type SocialProvider = 'apple' | 'google' | 'kakao';

// 소셜 계속하기 공용 처리. 로그인 화면과 첫 학습 완료 로그인 모달이 같이 쓴다.
export async function continueWithSocial(provider: SocialProvider, authenticated: boolean) {
  if (useMockApi) {
    await api.account.oauth(provider, { accessToken: 'mock-social-login' });
  } else if (!authenticated) {
    const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : null;
    if (!platform) throw new Error('웹에서는 임시 로그인을 사용할 수 없습니다.');
    await api.account.guest(platform);
  }
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
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const afterLogin = returnTo === '/social' ? '/social' : '/quiz';
  const session = useIntegration();
  const task = useTask();

  const continueWith = (provider: SocialProvider) => {
    if (task.busy) return;
    void task.run(async () => {
      await continueWithSocial(provider, session.authenticated);
      router.replace(afterLogin);
    });
  };

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
          로그인·회원가입
        </Text>
      </View>
      <View style={s.center}>
        <View style={[s.panel, { marginTop: headerToButtons }]}>
          <View style={s.buttons}>
            <SocialButton provider="apple" disabled={task.busy} onPress={continueWith} />
            <SocialButton provider="google" disabled={task.busy} onPress={continueWith} />
            <SocialButton provider="kakao" disabled={task.busy} onPress={continueWith} />
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
          {task.busy ? <ActivityIndicator accessibilityLabel="로그인 중" color="#f1f1f1" /> : null}
          {task.error ? (
            <Text allowFontScaling={false} accessibilityRole="alert" style={s.error}>
              {task.error}
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function SocialButton({
  provider,
  disabled,
  onPress,
}: {
  provider: SocialProvider;
  disabled: boolean;
  onPress: (provider: SocialProvider) => void;
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
  error: { color: '#f1f1f1', fontFamily: 'PretendardRegular', fontSize: 13, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
