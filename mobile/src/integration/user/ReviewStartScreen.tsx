import { useEffect, useRef, useState } from 'react';
import { BackArrow } from '../../components/settings/ControlSettingsUI';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, RadialGradient, Stop } from 'react-native-svg';
import { integrationApi as api } from '../runtime';
import { useTask } from '../hooks';
import { useReduceMotion, useTwinkle } from './twinkle';
import type { ReviewStatus } from '../models';
import { UserScreen, UserStatus } from './Screen';
import { ReviewEmptyModal } from './ReviewEmptyModal';
import { checkReviewStart, reviewRewardNotice } from './reviewStart';

// 배경 좌표계(viewBox 679×848). Figma 413:617.
const VIEW_W = 679;
const VIEW_H = 848;

type Star = { x: number; y: number; radius: number; glow: number };

// 궤도와 상관없는 배경 별. 제자리에서 은은하게 반짝인다(주기와 시작 시점을 다르게).
const twinklingStars: (Star & { duration: number; delay: number })[] = [
  { x: 20, y: 595, radius: 4, glow: 16, duration: 2600, delay: 0 },
  { x: 280, y: 18, radius: 2, glow: 16, duration: 3400, delay: 900 },
  { x: 292, y: 826, radius: 6, glow: 18, duration: 4200, delay: 1800 },
  // Figma 에 없는 추가 별. 작게, 카드·제목·버튼과 겹치지 않고 궤도선에서 75 이상 떨어진 자리.
  { x: -10, y: 200, radius: 2, glow: 10, duration: 3000, delay: 400 }, // 바깥 원 밖 ~98
  { x: 330, y: 260, radius: 1.5, glow: 8, duration: 3800, delay: 1300 }, // 안쪽 원 안 ~75
  { x: 100, y: 700, radius: 2.5, glow: 10, duration: 2200, delay: 2400 }, // 바깥 원 밖 ~113
];

// 궤도. 원 중심(cx, cy)을 축으로 돈다. 안쪽일수록 빠르다.
// direction 1 은 시계 방향, -1 은 반시계 방향(가운데 원만 거꾸로 돈다).
// main 은 Figma 의 별. extras 는 main 에서 angle(도)만큼 떨어진 추가 별이고 scale 은 main 대비 크기.
// 화면에는 원의 왼쪽 절반만 보이므로, 별 사이 간격이 모두 180° 보다 작게 두어 항상 하나 이상 보이게 한다.
type Orbit = {
  cx: number;
  cy: number;
  duration: number;
  direction: 1 | -1;
  main: Star;
  extras: { angle: number; scale: number }[];
};

const orbits: Orbit[] = [
  // r 187
  {
    cx: 365.5,
    cy: 366.5,
    duration: 60000,
    direction: 1,
    main: { x: 301, y: 538, radius: 23, glow: 24 },
    extras: [
      { angle: 150, scale: 0.6 },
      { angle: 250, scale: 0.4 },
    ],
  },
  // r 288
  {
    cx: 366.5,
    cy: 365.5,
    duration: 90000,
    direction: -1,
    main: { x: 99, y: 473, radius: 4, glow: 12 },
    extras: [
      { angle: 130, scale: 0.6 },
      { angle: 230, scale: 0.4 },
    ],
  },
  // r 313
  {
    cx: 365.5,
    cy: 366.5,
    duration: 120000,
    direction: 1,
    main: { x: 146, y: 143, radius: 9, glow: 24 },
    extras: [
      { angle: 165, scale: 0.6 },
      { angle: 265, scale: 0.4 },
    ],
  },
];

// main 을 중심 기준으로 회전시킨 자리에 크기를 줄인 별을 만든다.
function orbitStars({ cx, cy, main, extras }: Orbit): Star[] {
  return [
    main,
    ...extras.map(({ angle, scale }) => {
      const rad = (angle * Math.PI) / 180;
      const dx = main.x - cx;
      const dy = main.y - cy;
      return {
        x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
        radius: Math.max(2, main.radius * scale),
        glow: Math.max(8, main.glow * scale),
      };
    }),
  ];
}

// 배경 좌표계의 정사각형 영역을 부모 비율(%)로 놓는다. 화면 배율(scale)을 따로 넘기지 않는다.
function squareLayout(cx: number, cy: number, half: number) {
  const size = half * 2;
  return {
    position: 'absolute' as const,
    left: `${((cx - half) / VIEW_W) * 100}%` as const,
    top: `${((cy - half) / VIEW_H) * 100}%` as const,
    width: `${(size / VIEW_W) * 100}%` as const,
    height: `${(size / VIEW_H) * 100}%` as const,
  };
}

function StarGlowDefs({ id }: { id: string }) {
  return (
    <Defs>
      <RadialGradient id={id}>
        <Stop offset="0" stopColor="#f1f1f1" stopOpacity="0.5" />
        <Stop offset="0.35" stopColor="#f1f1f1" stopOpacity="0.2" />
        <Stop offset="1" stopColor="#f1f1f1" stopOpacity="0" />
      </RadialGradient>
    </Defs>
  );
}

function StarShape({ x, y, radius, glow, glowId }: Star & { glowId: string }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={radius + glow} fill={`url(#${glowId})`} />
      <Circle cx={x} cy={y} r={radius} fill="#f1f1f1" />
    </G>
  );
}

// 원 중심을 가운데로 둔 정사각형 레이어 하나에 궤도의 별을 모두 그리고, 레이어를 돌린다.
function OrbitLayer({
  orbit,
  index,
  reduceMotion,
}: {
  orbit: Orbit;
  index: number;
  reduceMotion: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: orbit.duration,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion, orbit.duration]);

  const { cx, cy, main } = orbit;
  const stars = orbitStars(orbit);
  const half = Math.hypot(main.x - cx, main.y - cy) + main.radius + main.glow;
  const glowId = `reviewOrbitGlow${index}`;
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${360 * orbit.direction}deg`],
  });

  return (
    <Animated.View style={[squareLayout(cx, cy, half), { transform: [{ rotate }] }]}>
      <Svg width="100%" height="100%" viewBox={`${cx - half} ${cy - half} ${half * 2} ${half * 2}`}>
        <StarGlowDefs id={glowId} />
        {stars.map((star, i) => (
          <StarShape key={i} {...star} glowId={glowId} />
        ))}
      </Svg>
    </Animated.View>
  );
}

function TwinklingStar({
  star,
  index,
  reduceMotion,
}: {
  star: (typeof twinklingStars)[number];
  index: number;
  reduceMotion: boolean;
}) {
  const opacity = useTwinkle({ duration: star.duration, delay: star.delay, reduceMotion });

  const { x, y, radius, glow } = star;
  const half = radius + glow;
  const glowId = `reviewTwinkleGlow${index}`;

  return (
    <Animated.View style={[squareLayout(x, y, half), { opacity }]}>
      <Svg width="100%" height="100%" viewBox={`${x - half} ${y - half} ${half * 2} ${half * 2}`}>
        <StarGlowDefs id={glowId} />
        <StarShape {...star} glowId={glowId} />
      </Svg>
    </Animated.View>
  );
}

function ReviewOrbits() {
  // 동작 줄이기 설정이면 별을 Figma 자리에 멈춰 두고 반짝임도 끈다.
  const reduceMotion = useReduceMotion();

  return (
    <>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} fill="none">
        <Circle cx={366.5} cy={365.5} r={288} stroke="#f1f1f1" strokeWidth={1} />
        <Circle cx={365.5} cy={366.5} r={313} stroke="#f1f1f1" strokeWidth={1} />
        <Circle cx={365.5} cy={366.5} r={187} stroke="#f1f1f1" strokeWidth={1} />
      </Svg>
      {twinklingStars.map((star, index) => (
        <TwinklingStar
          key={`${star.x}-${star.y}`}
          star={star}
          index={index}
          reduceMotion={reduceMotion}
        />
      ))}
      {orbits.map((orbit, index) => (
        <OrbitLayer key={index} orbit={orbit} index={index} reduceMotion={reduceMotion} />
      ))}
    </>
  );
}

export default function ReviewStartScreen() {
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
    else router.replace('/');
  };
  const task = useTask();
  // 복습 상태(API-504). null 은 아직 모름. 이 화면은 회차(API-501)를 만들지 않는다.
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  useEffect(() => {
    let active = true;
    // 진입할 때마다 서버 값을 읽어 날짜가 바뀐 뒤 재진입해도 그날 기준으로 표시한다.
    api.review
      .status()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        // 안내 문구는 선택 정보다. 실패하면 셋째 줄을 비워 두고, 시작 버튼에서 다시 확인한다.
      });
    return () => {
      active = false;
    };
  }, []);
  const startReview = () => {
    if (task.busy || emptyOpen) return;
    void task.run(
      () => checkReviewStart(() => api.review.status(), setStatus),
      (action) => {
        if (action.kind === 'empty') setEmptyOpen(true);
        else router.replace('/review');
      },
    );
  };
  const rewardNotice = reviewRewardNotice({
    rewardEligible: status?.rewardEligible ?? null,
    rewardAmount: status?.rewardAmount,
  });

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="복습 시작 화면 나가기"
          onPress={goBack}
          hitSlop={8}
          style={s.back}
        >
          <View style={s.backIcon}>
            <BackArrow color="#f1f1f1" />
          </View>
          <Text style={s.heading}>복습하기</Text>
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
          {/* Figma 656:3910 은 한 줄이다. 글꼴 폭 차이로 214 를 살짝 넘어도 줄바꿈하지 않게
              카드 안쪽 폭(테두리 안 278)까지 쓰고 가운데 정렬한다. Figma 칸 높이 14 는 글자(14px)보다
              낮아 Android 가 받침을 자르므로 높이를 고정하지 않는다. 카드 높이 148 안에 들어간다. */}
          <View style={[s.cardLine, { width: 278 * scale }]}>
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
          router.replace('/');
        }}
      />
    </UserScreen>
  );
}

const s = StyleSheet.create({
  canvas: { flex: 1, minHeight: 0, backgroundColor: '#161616', overflow: 'hidden' },
  orbits: { position: 'absolute' },
  // 342:526: 제어실·우주선 꾸미기·프로필 헤더와 같다. 안전 영역 아래 위 32 · 좌우 32, 높이 29,
  // 공용 '<'(BackArrow 14×25, 14×29 칸)와 제목 간격 12, Pretendard Bold 24.
  back: {
    position: 'absolute',
    top: 32,
    left: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 29,
  },
  heading: {
    color: '#f1f1f1',
    fontFamily: 'PretendardBold',
    fontSize: 24,
    includeFontPadding: false,
  },
  backIcon: { width: 14, height: 29, alignItems: 'center', justifyContent: 'center' },
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
  // Android 는 칸 밖 글자를 자르므로 줄 높이(normal)가 칸 높이 14 를 넘어도 보이게 둔다.
  cardLine: { alignItems: 'center', overflow: 'visible' },
  cardDescription: {
    color: '#161616',
    fontFamily: 'PretendardMedium',
    textAlign: 'center',
    includeFontPadding: false,
    // 칸 높이(14)에 눌리지 않고 글자 높이만큼 그대로 그린다. 넘친 부분은 cardLine 이 보이게 둔다.
    flexShrink: 0,
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as TextStyle) : null),
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
