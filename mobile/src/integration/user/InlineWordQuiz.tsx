// 틀린 곳 찾아 하나 고르기. SINGLE + config.presentation.type === 'INLINE_WORD'.
// Figma 틀린 곳 고르기(740:1240)·정답(739:1133)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
// options 는 문장 속 낱말 순서이고, 낱말을 누르면 그 순번을 답안으로 낸다.
// 고른 낱말은 Figma 처럼 회색 취소선으로 지운다. 오답이면 실제로 틀린 낱말을 정답색 취소선으로 보여 준다
// (오답 상태는 Figma 에 없어 해설 시트의 정답색만 빌린다).
// 채점 뒤에는 틀린 낱말(정답 순번) 바로 옆에 서버가 알려 준 바른 낱말(AnswerResult.correctWord)을 정답색으로 붙인다.
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { FEEDBACK_SHEET_COLORS } from './QuizFeedbackSheet';

export function InlineWordQuiz(props: PresentedChoiceProps) {
  const { scale } = props;
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={200}
      gap={40}
      renderChoices={({ choices, selected, correctIndex, result, ungraded, locked, choose }) => {
        // 틀린 낱말 자리. 맞혔으면 고른 낱말, 틀렸으면 서버가 알려 준 정답 순번이다.
        const wrongWordIndex =
          !result || ungraded ? null : result.isCorrect ? selected : correctIndex;
        const correctWord = result?.correctWord?.trim();
        return (
          <View style={[s.sentence, { columnGap: 12 * scale, rowGap: 20 * scale }]}>
            {choices.map((choice) => {
              const picked = selected === choice.index;
              const missed =
                !!result && !ungraded && !result.isCorrect && correctIndex === choice.index;
              return (
                <Fragment key={choice.index}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${choice.label}${picked ? ', 고름' : ''}`}
                    accessibilityState={{ selected: picked, disabled: locked }}
                    disabled={locked}
                    hitSlop={{ top: 10, bottom: 10, left: 6 * scale, right: 6 * scale }}
                    onPress={() => choose(choice.index)}
                  >
                    <Text style={[s.word, picked && s.picked, missed && s.missed]}>
                      {choice.label}
                    </Text>
                  </Pressable>
                  {correctWord && wrongWordIndex === choice.index ? (
                    <Text accessibilityLabel={`바른 낱말 ${correctWord}`} style={s.correctWord}>
                      {correctWord}
                    </Text>
                  ) : null}
                </Fragment>
              );
            })}
          </View>
        );
      }}
    />
  );
}

// Figma button_틀린단어맞추기(739:1182): Pretendard Medium 18, #424242. 고른 낱말은 #AAA 취소선(739:1187).
const s = StyleSheet.create({
  sentence: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  word: {
    color: '#424242',
    fontFamily: 'PretendardMedium',
    fontSize: 18,
    lineHeight: 22,
    includeFontPadding: false,
  },
  picked: { color: FEEDBACK_SHEET_COLORS.handle, textDecorationLine: 'line-through' },
  missed: { color: FEEDBACK_SHEET_COLORS.correct, textDecorationLine: 'line-through' },
  correctWord: {
    color: FEEDBACK_SHEET_COLORS.correct,
    fontFamily: 'PretendardBold',
    fontSize: 18,
    lineHeight: 22,
    includeFontPadding: false,
  },
});
