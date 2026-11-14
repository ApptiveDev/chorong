import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, StyleSheet, Text, type TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, RadialGradient, Stop } from 'react-native-svg';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import { storage } from '../storage';
import { positiveId } from '../ui';
import { UserScreen, UserStatus } from './Screen';
import { ReviewEmptyModal } from './ReviewEmptyModal';
import { checkReviewStart, reviewRewardNotice, reviewRewardedToday } from './reviewStart';

const orbitStars = [
  { x: 301, y: 538, radius: 23, glow: 24 },
  { x: 20, y: 595, radius: 4, glow: 16 },
  { x: 280, y: 18, radius: 2, glow: 16 },
  { x: 292, y: 826, radius: 6, glow: 18 },
  { x: 146, y: 143, radius: 9, glow: 24 },
  { x: 99, y: 473, radius: 4, glow: 12 },
];

function ReviewOrbits() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 679 848" fill="none">
      <Defs>
        <RadialGradient id="reviewStarGlow">
          <Stop offset="0" stopColor="#f1f1f1" stopOpacity="0.5" />
          <Stop offset="0.35" stopColor="#f1f1f1" stopOpacity="0.2" />
          <Stop offset="1" stopColor="#f1f1f1" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={366.5} cy={365.5} r={288} stroke="#f1f1f1" strokeWidth={1} />
      <Circle cx={365.5} cy={366.5} r={313} stroke="#f1f1f1" strokeWidth={1} />
      <Circle cx={365.5} cy={366.5} r={187} stroke="#f1f1f1" strokeWidth={1} />
      {orbitStars.map(({ x, y, radius, glow }) => (
        <G key={`${x}-${y}`}>
          <Circle cx={x} cy={y} r={radius + glow} fill="url(#reviewStarGlow)" />
          <Circle cx={x} cy={y} r={radius} fill="#f1f1f1" />
        </G>
      ))}
    </Svg>
  );
}

export default function ReviewStartScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [canvas, setCanvas] = useState({ width: 402, height: 874 });
  const scale = Math.min(
    canvas.width / 402,
    (canvas.height + insets.top + insets.bottom) / 874,
    1.2,
  );
  const top = (value: number) => value * scale - insets.top;
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/quiz');
  };
  const task = useTask();
  // 오늘 보상 세션이 남았는지(API-501 rewardEligible). null 은 아직 모름.
  const [rewardEligible, setRewardEligible] = useState<boolean | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  // 이 사용자가 오늘(KST) 복습 완료(API-503)에 성공했는지. null 은 아직 읽는 중.
  const userId = useIntegration().user?.userId;
  const [rewardedToday, setRewardedToday] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    reviewRewardedToday(storage, userId)
      .then((value) => {
        if (active) setRewardedToday(value);
      })
      .catch(() => {
        // 기록을 읽지 못하면 기록이 없는 것으로 보고 서버 rewardEligible 만 따른다.
        if (active) setRewardedToday(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  const loadReviewSet = async () => api.review.next(lessonId ? positiveId(lessonId) : undefined);
  useEffect(() => {
    let active = true;
    // 진입할 때마다 서버 값을 읽어 날짜가 바뀐 뒤 재진입해도 그날 기준으로 표시한다.
    loadReviewSet()
      .then((set) => {
        if (active) setRewardEligible(set.rewardEligible);
      })
      .catch(() => {
        // 안내 문구는 선택 정보다. 실패하면 셋째 줄을 비워 두고, 시작 버튼에서 다시 확인한다.
      });
    return () => {
      active = false;
    };
  }, [lessonId]);
  const navigateToReview = () => {
    if (lessonId) router.replace({ pathname: '/review', params: { lessonId } });
    else router.replace('/review');
  };
  const startReview = () => {
    if (task.busy || emptyOpen) return;
    void task.run(
      () => checkReviewStart(loadReviewSet, (set) => setRewardEligible(set.rewardEligible)),
      (action) => {
        if (action.kind === 'empty') setEmptyOpen(true);
        else navigateToReview();
      },
    );
  };
  const rewardNotice = reviewRewardNotice({ rewardEligible, rewardedToday });

  return (
    <UserScreen title="복습하기" showTitle={false} scroll={false} dark>
      <StatusBar style="light" />
      <View
        style={s.canvas}
        onLayout={({ nativeEvent: { layout } }) => {
          setCanvas((previous) =>
            previous.width === layout.width && previous.height === layout.height
              ? previous
              : { width: layout.width, height: layout.height },
          );
        }}
      >
        <View
          pointerEvents="none"
          style={[
            s.orbits,
            {
              top: top(12),
              left: canvas.width - 361.5 * scale,
              width: 679 * scale,
              height: 848 * scale,
            },
          ]}
        >
          <ReviewOrbits />
        </View>
        <View style={[s.titleRule, { top: top(89), width: 152 * scale }]}>
          <View style={s.titleDot} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="복습 시작 화면 나가기"
          onPress={goBack}
          style={[s.back, { top: top(52), left: 14 * scale }]}
        >
          <Ionicons name="chevron-back" size={27 * scale} color="#f1f1f1" />
          <Text style={[s.heading, { fontSize: 24 * scale }]}>복습하기</Text>
        </Pressable>

        {/* Figma 342:540 · 656:3917: 286×148, 테두리 4, 위아래 20, 줄 간격 20 */}
        <View
          style={[
            s.card,
            {
              top: top(325.5),
              width: 286 * scale,
              height: 148 * scale,
              paddingTop: 20 * scale,
              gap: 20 * scale,
            },
          ]}
        >
          <View style={[s.cardTitleWrap, { width: 214 * scale, height: 32 * scale }]}>
            <Text style={[s.cardTitle, { fontSize: 16 * scale }]}>배운 내용을 다시 확인해요</Text>
          </View>
          <View style={[s.cardLine, { width: 214 * scale, height: 14 * scale }]}>
            <Text style={[s.cardDescription, { fontSize: 14 * scale }]}>
              학습한 퀴즈 5개를 통해 복습해봐요!
            </Text>
          </View>
          <View style={[s.cardLine, { width: 214 * scale, height: 14 * scale }]}>
            {rewardNotice ? (
              <Text style={[s.cardReward, { fontSize: 10.8 * scale }]}>{rewardNotice}</Text>
            ) : null}
          </View>
        </View>

        <View style={[s.status, { bottom: Math.max(12, 88 * scale - insets.bottom) + 56 * scale }]}>
          <UserStatus task={task} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: task.busy }}
          disabled={task.busy}
          onPress={startReview}
          style={[
            s.startButton,
            {
              bottom: Math.max(12, 88 * scale - insets.bottom),
              width: Math.min(canvas.width - 80 * scale, 322 * scale),
              height: 48 * scale,
            },
          ]}
        >
          <Text style={[s.startButtonText, { fontSize: 16 * scale }]}>복습 시작</Text>
        </Pressable>
      </View>
      <ReviewEmptyModal
        visible={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        onGoHome={() => {
          setEmptyOpen(false);
          router.replace('/quiz');
        }}
      />
    </UserScreen>
  );
}

const s = StyleSheet.create({
  canvas: { flex: 1, minHeight: 0, backgroundColor: '#161616', overflow: 'hidden' },
  orbits: { position: 'absolute' },
  titleRule: {
    position: 'absolute',
    left: 0,
    height: 1,
    backgroundColor: '#f1f1f1',
  },
  titleDot: {
    position: 'absolute',
    right: -3,
    top: -2,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#f1f1f1',
  },
  back: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 34 },
  heading: {
    color: '#f1f1f1',
    fontFamily: 'PretendardBold',
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0px 0px 2px #f1f1f1' } as TextStyle)
      : {
          textShadowColor: '#f1f1f1',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 2,
        }),
  },
  card: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: '#e4e4e4',
    borderWidth: 4,
    borderColor: '#161616',
    borderRadius: 8,
    boxShadow: '0px 0px 10px 0px #161616',
  },
  cardTitleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
  },
  cardTitle: {
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    textAlign: 'center',
    includeFontPadding: false,
  },
  // Figma 텍스트 칸 높이 14. 글자는 칸 위에서 시작한다.
  cardLine: { alignItems: 'center' },
  cardDescription: {
    color: '#161616',
    fontFamily: 'PretendardMedium',
    textAlign: 'center',
    includeFontPadding: false,
  },
  cardReward: {
    color: '#161616',
    fontFamily: 'PretendardBold',
    textAlign: 'center',
    includeFontPadding: false,
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0px 0px 4px #ffffff' } as TextStyle)
      : {
          textShadowColor: '#ffffff',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 4,
        }),
  },
  status: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 40 },
  startButton: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f1f1f1',
    borderRadius: 4,
    backgroundColor: '#161616',
    boxShadow: '0px 0px 8px 0px #f1f1f1',
  },
  startButtonText: { color: '#f1f1f1', fontFamily: 'PretendardRegular' },
});
