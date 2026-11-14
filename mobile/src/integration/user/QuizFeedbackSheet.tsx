// 채점 뒤 아래에서 올라오는 정답·해설 시트. Figma Frame 139/140(739:882·739:982)을 따른다.
// 초성(ChosungQuiz)·소리 듣고 고르기(AudioChoiceQuiz)가 함께 쓴다.
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Mask, Path } from 'react-native-svg';
import type { AnswerResult } from '../models';

// Figma 739:892 의 정답색은 #3D8F11 로 공통 팔레트(QUIZ_FEEDBACK_COLORS.correct #67B13F)와 다르다.
// 시트는 Figma 값을 쓴다. 오답색은 공통 팔레트와 같다.
export const FEEDBACK_SHEET_COLORS = {
  base: '#161616',
  tertiary: '#747474',
  sheet: '#E4E4E4',
  handle: '#AAAAAA',
  fale: '#F1F1F1',
  correct: '#3D8F11',
  wrong: '#F92669',
} as const;
const color = FEEDBACK_SHEET_COLORS;

// Figma Frame 140: 높이 210, 안쪽 36·20, 위 모서리 12.
export const FEEDBACK_SHEET_HEIGHT = 210;

export function QuizFeedbackSheet({
  result,
  progress,
  nextDisabled,
  onNext,
}: {
  result: AnswerResult;
  // 0 → 1 로 움직이면 시트가 아래에서 올라온다.
  progress: Animated.Value;
  nextDisabled: boolean;
  onNext: () => void;
}) {
  const resultColor = result.isCorrect ? color.correct : color.wrong;
  const explanation = result.explanation?.trim() ? result.explanation.trim().split(/\s*\n\s*/) : [];
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        s.sheet,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [FEEDBACK_SHEET_HEIGHT, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={s.handle} />
      <View style={s.feedback}>
        <View style={s.feedbackTitleRow}>
          {result.isCorrect ? <CorrectStarIcon /> : <WrongCrossIcon />}
          <Text style={[s.feedbackTitle, { color: resultColor }]}>
            {result.isCorrect ? '정답' : '오답'}
          </Text>
        </View>
        {explanation.length ? (
          <View style={s.explanation}>
            {explanation.map((line, index) => (
              <Text key={index} style={s.explanationText}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onNext}
        style={s.next}
      >
        <Text style={s.nextText}>다음</Text>
      </Pressable>
    </Animated.View>
  );
}

// Figma Star 1(I739:883;737:860). 24 칸 안에 7.84% 여백을 두고 안쪽 선(마스크)으로 그린다.
function CorrectStarIcon() {
  const star =
    'M9.18061 0.652964C9.50276 -0.217654 10.7342 -0.217655 11.0563 0.652963L13.2 6.44613C13.3013 6.71985 13.5171 6.93566 13.7908 7.03694L19.5839 9.18061C20.4546 9.50276 20.4546 10.7342 19.584 11.0563L13.7908 13.2C13.5171 13.3013 13.3013 13.5171 13.2 13.7908L11.0563 19.5839C10.7342 20.4546 9.50276 20.4546 9.18061 19.584L7.03694 13.7908C6.93566 13.5171 6.71985 13.3013 6.44613 13.2L0.652964 11.0563C-0.217654 10.7342 -0.217655 9.50276 0.652963 9.18061L6.44613 7.03694C6.71985 6.93566 6.93566 6.71985 7.03694 6.44613L9.18061 0.652964Z';
  return (
    <Svg width={24} height={24} viewBox="-1.8816 -1.8816 24 24" fill="none">
      <Mask id="feedbackStarStroke" fill="white">
        <Path d={star} />
      </Mask>
      <Path d={star} stroke={color.correct} strokeWidth={3.2} mask="url(#feedbackStarStroke)" />
    </Svg>
  );
}

// Figma Union(739:954). 12 칸에 -4.17% 여백(13×13)으로 그린다.
function WrongCrossIcon() {
  return (
    <View style={s.crossBox}>
      <Svg width={13} height={13} viewBox="0 0 13 13" fill="none" style={s.crossSvg}>
        <Path
          d="M11.6423 0.647217C11.8386 0.450928 12.1565 0.450928 12.3528 0.647217C12.5491 0.843507 12.5491 1.16143 12.3528 1.35772L7.21051 6.5L12.3528 11.6423C12.5491 11.8386 12.5491 12.1565 12.3528 12.3528C12.1565 12.5491 11.8386 12.5491 11.6423 12.3528L6.5 7.21051L1.35772 12.3528C1.16143 12.5491 0.843507 12.5491 0.647217 12.3528C0.450928 12.1565 0.450928 11.8386 0.647217 11.6423L5.78949 6.5L0.647217 1.35772C0.450928 1.16143 0.450928 0.843507 0.647217 0.647217C0.843507 0.450928 1.16143 0.450928 1.35772 0.647217L6.5 5.78949L11.6423 0.647217Z"
          fill="black"
          stroke={color.wrong}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    marginTop: 'auto',
    width: '100%',
    minHeight: FEEDBACK_SHEET_HEIGHT,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 36,
    paddingVertical: 20,
    backgroundColor: color.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: color.tertiary,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  // Vector 95: 길이 72 + 둥근 끝 2씩, 굵기 4
  handle: { width: 76, height: 4, borderRadius: 2, backgroundColor: color.handle },
  feedback: { width: '100%', gap: 12 },
  feedbackTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedbackTitle: { fontFamily: 'PretendardBold', fontSize: 16, lineHeight: 20 },
  crossBox: { width: 12, height: 12 },
  crossSvg: { position: 'absolute', left: -0.5, top: -0.5 },
  explanation: { gap: 4 },
  explanationText: {
    color: color.base,
    fontFamily: 'PretendardMedium',
    fontSize: 16,
    lineHeight: 20,
  },
  next: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: color.fale,
    backgroundColor: color.base,
    boxShadow: '0px 0px 4px 0px #f1f1f1',
  },
  nextText: { color: color.fale, fontFamily: 'PretendardRegular', fontSize: 16 },
});
