import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Image,
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
import { integrationApi as api, useMockApi } from '../runtime';

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
  const { height } = useWindowDimensions();
  const native = Platform.OS !== 'web';
  const compact = native && height < 700;
  const session = useIntegration();
  const task = useTask();
  const [loadedImages, setLoadedImages] = useState(0);
  const imagesReady = loadedImages === 0b111111111;
  const sceneReady = imagesReady && session.ready;
  const markImageLoaded = (index: number) => {
    setLoadedImages((previous) => previous | (1 << index));
  };
  const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : null;
  const start = () => {
    if (session.authenticated) {
      router.replace('/quiz');
      return;
    }
    if (!platform && !useMockApi) return;
    void task.run(async () => {
      await api.account.guest(platform ?? 'ANDROID');
      try {
        const { courses } = await api.learning.courses();
        const firstCourse = courses[0];
        if (firstCourse) {
          const detail = await api.learning.course(firstCourse.courseId);
          const firstLesson = detail.lessons.find((lesson) => lesson.status !== 'LOCKED');
          if (firstLesson) {
            router.replace({
              pathname: '/learn/study/[lessonId]',
              params: {
                lessonId: String(firstLesson.lessonId),
                title: firstLesson.title,
                fromWelcome: 'true',
              },
            });
            return;
          }
        }
      } catch {
        // 게스트 계정은 유지하고 학습 홈에서 다시 불러온다.
      }
      router.replace('/quiz');
    });
  };

  return (
    <SafeAreaView style={s.page}>
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
        <Image
          source={require('../../../assets/onboarding/star-small.png')}
          style={s.starTop}
          onLoadEnd={() => markImageLoaded(1)}
        />
        <Image
          source={require('../../../assets/onboarding/star-large.png')}
          style={s.starRight}
          onLoadEnd={() => markImageLoaded(2)}
        />
        <Image
          source={require('../../../assets/onboarding/star-medium.png')}
          style={s.starLeft}
          onLoadEnd={() => markImageLoaded(3)}
        />
        <Image
          source={require('../../../assets/onboarding/star-small-alt.png')}
          style={s.starMid}
          onLoadEnd={() => markImageLoaded(4)}
        />
        <Image
          source={require('../../../assets/onboarding/star-large.png')}
          style={s.starLowerLeft}
          onLoadEnd={() => markImageLoaded(5)}
        />
        <Image
          source={require('../../../assets/onboarding/star-small.png')}
          style={s.starLowerSmall}
          onLoadEnd={() => markImageLoaded(6)}
        />
        <Image
          source={require('../../../assets/onboarding/star-footer.png')}
          style={s.starFooter}
          onLoadEnd={() => markImageLoaded(7)}
        />
        <ScrollView
          style={s.scroll}
          scrollEnabled={!native}
          contentContainerStyle={[
            s.content,
            native && s.nativeContent,
            compact && s.compactContent,
          ]}
        >
          <View style={[s.center, native && s.nativeCenter, compact && s.compactCenter]}>
            <View style={[s.titleGroup, native && s.nativeTextGroup]}>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.titleSmall, compact && s.compactTitleSmall]}
              >
                작은 배움이 모이는
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.titleLarge, compact && s.compactTitleLarge]}
              >
                나만의 우주
              </Text>
            </View>
            <Image
              source={require('../../../assets/onboarding/orbit.png')}
              style={[s.orbit, compact && s.compactOrbit]}
              onLoadEnd={() => markImageLoaded(8)}
            />
            <View style={[s.descriptionGroup, native && s.nativeTextGroup]}>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.description, compact && s.compactDescription]}
              >
                하나의 이야기를 배우고
              </Text>
              <Text
                allowFontScaling={false}
                numberOfLines={native ? 1 : undefined}
                adjustsFontSizeToFit={native}
                style={[s.description, s.glowingDescription, compact && s.compactDescription]}
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
            {!session.authenticated && !platform && !useMockApi ? (
              <Text allowFontScaling={false} style={s.webNotice}>
                웹 비회원 시작은 현재 API에서 지원하지 않습니다.
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: task.busy || (!session.authenticated && !platform && !useMockApi),
              }}
              disabled={task.busy || (!session.authenticated && !platform && !useMockApi)}
              onPress={start}
              style={[
                s.primary,
                compact && s.compactButton,
                (task.busy || (!session.authenticated && !platform && !useMockApi)) && s.disabled,
              ]}
            >
              <Text allowFontScaling={false} numberOfLines={1} style={s.primaryText}>
                첫 학습 시작하기
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              style={[s.secondary, compact && s.compactButton]}
            >
              <Text allowFontScaling={false} numberOfLines={1} style={s.secondaryText}>
                로그인 / 회원가입
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
  nativeContent: {
    justifyContent: 'space-between',
    gap: 0,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 20,
  },
  compactContent: { paddingTop: 44, paddingBottom: 12 },
  center: {
    width: 174,
    alignItems: 'center',
    gap: 56,
  },
  nativeCenter: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
    gap: 0,
    marginBottom: 32,
  },
  compactCenter: { marginBottom: 16 },
  titleGroup: { alignItems: 'center', gap: 8, width: 174 },
  nativeTextGroup: { width: '100%' },
  titleSmall: {
    color: '#f1f1f1',
    fontFamily: 'KkakdugiRegular',
    fontSize: 24,
    textAlign: 'center',
  },
  titleLarge: { color: '#f1f1f1', fontFamily: 'KkakdugiBold', fontSize: 36, textAlign: 'center' },
  compactTitleSmall: { fontSize: 20 },
  compactTitleLarge: { fontSize: 30 },
  orbit: { width: 145, height: 145 },
  compactOrbit: { width: 116, height: 116 },
  descriptionGroup: { alignItems: 'center', gap: 12, width: 174 },
  description: { color: '#f1f1f1', fontFamily: 'KimmLight', fontSize: 16, textAlign: 'center' },
  compactDescription: { fontSize: 14 },
  glowingDescription:
    Platform.OS === 'web'
      ? ({ textShadow: '0px 0px 4px #f1f1f1' } as TextStyle)
      : {
          textShadowColor: '#f1f1f1',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 4,
        },
  footer: { width: '100%', maxWidth: 328, gap: 16 },
  compactButton: { height: 44 },
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
  webNotice: { color: '#f1f1f1', fontFamily: 'KimmLight', fontSize: 12, textAlign: 'center' },
});
