// 소리 듣고 하나 고르기. SINGLE + config.presentation.type === 'AUDIO'.
// Figma 소리듣고(739:1095)·정답(739:1031)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
// 음원 재생은 quizAudio.ts 가 맡고, 이 화면은 재생 상태만 받는다.
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { FEEDBACK_SHEET_COLORS } from './QuizFeedbackSheet';
import { quizAudioUrl, useQuizAudio, type QuizAudioStatus } from './quizAudio';

const color = FEEDBACK_SHEET_COLORS;

export function AudioChoiceQuiz(props: PresentedChoiceProps) {
  const audio = useQuizAudio(quizAudioUrl(props.quiz));
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={200}
      gap={40}
      media={({ locked }) => (
        <View pointerEvents="box-none" style={s.playerRow}>
          <StopWhenLocked locked={locked} stop={audio.stop} />
          <AudioPlayButton status={audio.status} onPress={audio.toggle} />
        </View>
      )}
    />
  );
}

// 보기를 고르면 재생을 멈춘다. 다음 문항으로 넘어갈 때는 useQuizAudio 정리 단계가 멈춘다.
function StopWhenLocked({ locked, stop }: { locked: boolean; stop: () => void }) {
  useEffect(() => {
    if (locked) stop();
  }, [locked]);
  return null;
}

// Figma button_음악 재생(739:1065). 32 칸 재생 삼각형. 재생 중에는 정지 아이콘으로 바꾼다.
// 정지·로딩 상태는 Figma 에 없어 같은 색·크기로만 맞춘다.
function AudioPlayButton({ status, onPress }: { status: QuizAudioStatus; onPress: () => void }) {
  const playing = status === 'playing';
  const unavailable = status === 'unavailable';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? '소리 멈추기' : '소리 듣기'}
      accessibilityState={{
        disabled: unavailable || status === 'loading',
        busy: status === 'loading',
      }}
      disabled={unavailable || status === 'loading'}
      hitSlop={12}
      onPress={onPress}
      style={[s.play, unavailable && s.playUnavailable]}
    >
      {status === 'loading' ? (
        <ActivityIndicator color={color.base} />
      ) : (
        <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
          {playing ? (
            <>
              <Rect x={8} y={4} width={6} height={24} rx={1} fill={color.base} />
              <Rect x={18} y={4} width={6} height={24} rx={1} fill={color.base} />
            </>
          ) : (
            <Path
              d="M30.5 15.134C31.1667 15.5189 31.1667 16.4811 30.5 16.866L9.5 28.9904C8.83333 29.3753 8 28.8942 8 28.1244V3.87564C8 3.10584 8.83333 2.62472 9.5 3.00962L30.5 15.134Z"
              fill={color.base}
            />
          )}
        </Svg>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  playerRow: { width: '100%', alignItems: 'center' },
  play: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  playUnavailable: { opacity: 0.3 },
});
