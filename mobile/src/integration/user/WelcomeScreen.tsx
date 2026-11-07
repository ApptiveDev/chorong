import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTask } from '../hooks';
import { integrationApi as api, useMockApi } from '../runtime';
import { UserStatus } from './Screen';

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
  const task = useTask();
  const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : null;
  const start = () => {
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
      <View style={s.center}>
        <View style={s.titleGroup}>
          <Text style={s.titleSmall}>작은 배움이 모이는</Text>
          <Text style={s.titleLarge}>나만의 우주</Text>
        </View>
        <WelcomeCat />
        <Text style={s.description}>하나의 이야기를 배우고{'\n'}첫 별을 밝혀보세요.</Text>
      </View>
      <View style={s.footer}>
        <UserStatus task={task} />
        {!platform && !useMockApi ? (
          <Text style={s.webNotice}>웹 비회원 시작은 현재 API에서 지원하지 않습니다.</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: task.busy || (!platform && !useMockApi) }}
          disabled={task.busy || (!platform && !useMockApi)}
          onPress={start}
          style={[s.primary, (task.busy || (!platform && !useMockApi)) && s.disabled]}
        >
          <Text style={s.primaryText}>첫 학습 시작하기</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account')}
          style={s.secondary}
        >
          <Text style={s.secondaryText}>로그인·회원가입</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fbfaff' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
    paddingHorizontal: 26,
  },
  titleGroup: { alignItems: 'center', gap: 4 },
  titleSmall: { color: '#27223d', fontSize: 20, textAlign: 'center' },
  titleLarge: { color: '#211d37', fontSize: 29, fontWeight: '700', textAlign: 'center' },
  description: { color: '#817790', fontSize: 15, lineHeight: 25, textAlign: 'center' },
  footer: { paddingHorizontal: 26, paddingBottom: 30, gap: 10 },
  primary: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: '#302b38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondary: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: '#f2f0f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#655b76', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.38 },
  webNotice: { color: '#817790', fontSize: 12, textAlign: 'center' },
});
