import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useIntegration, useTask } from '../hooks';
import { devicePlatform, integrationApi as api } from '../runtime';
import { firstStudyRoute } from './welcomeFlow';
import { useReduceMotion, useTwinkle } from './twinkle';

// 배경 별 이미지. 주기와 시작 시점을 별마다 달리 해 은은하게 반짝인다(동시에 깜빡이지 않게).
function TwinklingStar({
  source,
  style,
  duration,
  delay,
  reduceMotion,
  onLoadEnd,
}: {
  source: ImageSourcePropType;
  style: StyleProp<ImageStyle>;
  duration: number;
  delay: number;
  reduceMotion: boolean;
  onLoadEnd: () => void;
}) {
  const opacity = useTwinkle({ duration, delay, min: 0.35, reduceMotion });
  return <Animated.Image source={source} style={[style, { opacity }]} onLoadEnd={onLoadEnd} />;
}

export function WelcomeCat({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="초롱이">
      <Path
        d="M14 29L12 10l17 12h9L53 9l-2 22c7 14 1 25-17 25S9 47 14 29z"
        fill="#f6f0de"
        stroke="#7d6e68"
        strokeWidth={2}
      />
      <Path d="M18 22l-2-7 9 8M41 23l8-9-1 10" fill="#deb7ac" />
      <Path d="M23 35v4M42 35v4" stroke="#6c5e5c" strokeWidth={3} strokeLinecap="round" />
      <Path
        d="M30 40l3 3 3-3M33 43v3m0 0l-4 2m4-2 4 2"
        fill="none"
        stroke="#b18f85"
        strokeWidth={1.5}
      />
      <Path d="M8 37l12 3M7 45l12-2M47 40l12-3M47 44l13 1" stroke="#bfae9e" strokeWidth={1.5} />
      <Path d="M29 25l2 5M36 25l-1 5" stroke="#d5bc99" strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { height } = useWindowDimensions();
  const native = Platform.OS !== 'web';
  const orbitSize = native && height < 700 ? Math.max(112, Math.round((144 * height) / 874)) : 144;
  const gapScale = native
    ? Math.max(0, Math.min(1, height / 874, (height - 52 - 80 - orbitSize - 44 - 112) / 221))
    : 1;
  const innerGap = Math.round(56 * gapScale);
  const outerGap = Math.round(109 * gapScale);
  const session = useIntegration();
  const task = useTask();
  const [loadedImages, setLoadedImages] = useState(0);
  const imagesReady = loadedImages === 0b111111111;
  const sceneReady = imagesReady && session.ready;
  const markImageLoaded = (index: number) => {
    setLoadedImages((previous) => previous | (1 << index));
  };
  const start = () => {
    if (!session.ready || task.busy) return;
    if (session.authenticated && session.user?.status !== 'GUEST') {
      router.replace('/');
      return;
    }
    void task.run(async () => {
      if (!session.authenticated) await api.account.guest(devicePlatform());
      // 레슨을 못 불러오면 게스트 계정은 유지하고 학습 홈에서 다시 불러온다.
      router.replace((await firstStudyRoute(api.learning)) ?? '/');
    });
  };

  return (
    <SafeAreaView style={s.page} edges={native ? [] : undefined}>
      <StatusBar style="light" />
      <View
        style={[s.scene, !sceneReady && s.sceneHidden]}
        pointerEvents={sceneReady ? 'auto' : 'none'}
      >
        <Image
          source={require('../../../assets/onboarding/space-background.png')}
          style={s.background}
          resizeMode="stretch"
          onLoadEnd={() => markImageLoaded(0)}
        />
        <TwinklingStar
          source={require('../../../assets/onboarding/star-small.png')}
          style={s.starTop}
          duration={2800}
          delay={0}
          reduceMotion={reduceMotion}
          onLoadEnd={() => markImageLoaded(1)}
        />
        <TwinklingStar
          source={require('../../../assets/onboarding/star-large.png')}
          style={s.starRight}
          duration={3600}
          delay={700}
          reduceMotion={reduceMotion}
          onLoadEnd={() => markImageLoaded(2)}
        />
        <TwinklingStar
          source={require('../../../assets/onboarding/star-medium.png')}
          style={s.starLeft}
          duration={3200}
          delay={1500}
          reduceMotion={reduceMotion}
          onLoadEnd={() => markImageLoaded(3)}
        />
        <TwinklingStar
          source={require('../../../assets/onboarding/star-small-alt.png')}
          style={s.starMid}
          duration={2600}
          delay={400}
          reduceMotion={reduceMotion}
          onLoadEnd={() => markImageLoaded(4)}
        />
        <TwinklingStar
          source={require('../../../assets/onboarding/star-large.png')}
          style={s.starLowerLeft}
          duration={4000}
          delay={2100}
          reduceMotion={reduceMotion}
          onLoadEnd={() => markImageLoaded(5)}
        />
        <TwinklingStar
          source={require('../../../assets/onboarding/star-small.png')}
          style={s.starLowerSmall}
          duration={3000}
          delay={1100}
          reduceMotion={reduceMotion}
          onLoadEnd={() => markImageLoaded(6)}
        />
        <TwinklingStar
          source={require('../../../assets/onboarding/star-footer.png')}
          style={s.starFooter}
          duration={3800}
          delay={1800}
          reduceMotion={reduceMotion}
          onLoadEnd={() => markImageLoaded(7)}
        />
        <ScrollView
          style={s.scroll}
          scrollEnabled={!native}
          contentContainerStyle={[s.content, native && { gap: outerGap }]}
        >
          <View style={[s.center, native && { gap: innerGap }]}>
            <View style={[s.titleGroup, native && s.nativeTitleGroup]}>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.titleSmall, native && s.nativeTitleSmall]}
              >
                작은 배움이 모이는
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.titleLarge, native && s.nativeTitleLarge]}
              >
                나만의 우주
              </Text>
            </View>
            <Image
              source={require('../../../assets/onboarding/orbit.png')}
              style={[s.orbit, native && { width: orbitSize, height: orbitSize }]}
              onLoadEnd={() => markImageLoaded(8)}
            />
            <View style={[s.descriptionGroup, native && s.nativeDescriptionGroup]}>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.description, native && s.nativeDescription]}
              >
                하나의 이야기를 배우고
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.description, s.glowingDescription, native && s.nativeDescription]}
              >
                첫 별을 밝혀보세요.
              </Text>
            </View>
          </View>
          <View style={s.footer}>
            {task.busy ? (
              <ActivityIndicator accessibilityLabel="불러오는 중" color="#f1f1f1" />
            ) : null}
            {task.error ? (
              <Text allowFontScaling={false} accessibilityRole="alert" style={s.error}>
                {task.error.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\(HTTP \d+\)$/, '')}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: !session.ready || task.busy,
              }}
              disabled={!session.ready || task.busy}
              onPress={start}
              style={[s.primary, (!session.ready || task.busy) && s.disabled]}
            >
              <Text allowFontScaling={false} numberOfLines={1} style={s.primaryText}>
                첫 학습 시작하기
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              // entry=existing: 로그인 결과가 새 계정이면 SocialLoginScreen 이 M01_3 을 띄운다.
              onPress={() => router.push({ pathname: '/account', params: { entry: 'existing' } })}
              style={s.secondary}
            >
              <Text allowFontScaling={false} numberOfLines={1} style={s.secondaryText}>
                기존 계정으로 로그인
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#161616' },
  scene: { flex: 1 },
  scroll: { flex: 1 },
  sceneHidden: { opacity: 0 },
  background: { position: 'absolute', top: 0, width: '100%', height: '100%' },
  starTop: {
    position: 'absolute',
    left: '12.4%',
    top: 79,
    width: 52,
    height: 52,
  },
  starRight: {
    position: 'absolute',
    right: '11.4%',
    top: 94,
    width: 60,
    height: 60,
  },
  starLeft: {
    position: 'absolute',
    left: '3.2%',
    top: 179,
    width: 56,
    height: 56,
  },
  starMid: {
    position: 'absolute',
    right: '14.4%',
    top: 302,
    width: 52,
    height: 52,
  },
  starLowerLeft: {
    position: 'absolute',
    left: '3.2%',
    top: 544,
    width: 60,
    height: 60,
  },
  starLowerSmall: {
    position: 'absolute',
    left: '10.4%',
    top: 524,
    width: 52,
    height: 52,
  },
  starFooter: {
    position: 'absolute',
    right: '8.9%',
    bottom: 28,
    width: 64,
    height: 64,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 109,
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 12,
  },
  center: {
    width: 174,
    alignItems: 'center',
    gap: 56,
  },
  titleGroup: { alignItems: 'center', gap: 8, width: 174 },
  nativeTitleGroup: { height: 80 },
  titleSmall: {
    color: '#f1f1f1',
    fontFamily: 'KkakdugiRegular',
    fontSize: 24,
    textAlign: 'center',
  },
  titleLarge: { color: '#f1f1f1', fontFamily: 'KkakdugiBold', fontSize: 36, textAlign: 'center' },
  nativeTitleSmall: { height: 28, lineHeight: 28, includeFontPadding: false },
  nativeTitleLarge: { height: 44, lineHeight: 44, includeFontPadding: false },
  orbit: { width: 145, height: 145 },
  descriptionGroup: { alignItems: 'center', gap: 12, width: 174 },
  nativeDescriptionGroup: { height: 44 },
  description: { color: '#f1f1f1', fontFamily: 'KimmLight', fontSize: 16, textAlign: 'center' },
  nativeDescription: { height: 16, lineHeight: 16, includeFontPadding: false },
  glowingDescription:
    Platform.OS === 'web'
      ? ({ textShadow: '0px 0px 4px #f1f1f1' } as TextStyle)
      : {
          textShadowColor: '#f1f1f1',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 4,
        },
  footer: { width: '100%', maxWidth: 328, gap: 16 },
  primary: {
    height: 48,
    borderRadius: 4,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 0px 8px 0px rgba(241, 241, 241, 0.8)',
  },
  primaryText: { color: '#161616', fontFamily: 'KkakdugiRegular', fontSize: 16, lineHeight: 24 },
  secondary: {
    height: 48,
    borderWidth: 1,
    borderColor: '#f1f1f1',
    borderRadius: 4,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 0px 8px 0px rgba(241, 241, 241, 0.8)',
  },
  secondaryText: { color: '#f1f1f1', fontFamily: 'KkakdugiRegular', fontSize: 16, lineHeight: 24 },
  disabled: { opacity: 0.38 },
  error: { color: '#f1f1f1', fontFamily: 'KimmLight', fontSize: 14, textAlign: 'center' },
});
