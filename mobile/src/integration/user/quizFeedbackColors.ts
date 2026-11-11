// 퀴즈 정오답 확정 상태 전용 팔레트. Figma 360:780(OX)·360:798(선택지) 값이다.
// 선택 전·선택 중·대기 상태 색상에는 쓰지 않는다. 글자색은 Figma 대로 테두리색과 같다.
export const QUIZ_FEEDBACK_COLORS = {
  correct: { border: '#67B13F', background: '#A0FF2333', text: '#67B13F' },
  incorrect: { border: '#F92669', background: '#FFC2C933', text: '#F92669' },
  // 오답을 골랐을 때 고르지 않은 실제 정답. Figma 에 없는 상태라 정답 색의 투명도만 낮춘다.
  answer: { border: '#67B13F66', background: '#A0FF231A', text: '#67B13F99' },
} as const;

// 채점된 요소의 테두리·배경. 모서리·크기는 각 컴포넌트 값을 그대로 쓴다.
// Figma 에서 테두리를 쓰는 곳은 OX 버튼뿐이다. 선택지·빈칸 버튼은 배경·글자색만 쓴다.
export const quizFeedbackSurface = {
  correct: {
    borderWidth: 1,
    borderColor: QUIZ_FEEDBACK_COLORS.correct.border,
    backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background,
  },
  incorrect: {
    borderWidth: 1,
    borderColor: QUIZ_FEEDBACK_COLORS.incorrect.border,
    backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background,
  },
  answer: {
    borderWidth: 1,
    borderColor: QUIZ_FEEDBACK_COLORS.answer.border,
    backgroundColor: QUIZ_FEEDBACK_COLORS.answer.background,
  },
} as const;
