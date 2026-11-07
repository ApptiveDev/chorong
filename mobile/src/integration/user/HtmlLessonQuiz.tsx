import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';

type HtmlKind = 'ox' | 'blank' | 'single' | 'range' | 'multi' | 'match';
type Choice = { index: number; label: string };

export function isHtmlLessonQuiz(quiz: Quiz): boolean {
  return ['ox', 'blank', 'single', 'range', 'multi', 'match'].includes(
    String(quiz.options?.mockHtmlType),
  );
}

function formatMass(value: number) {
  if (value >= 100000000)
    return `${(value / 100000000).toFixed(value % 100000000 === 0 ? 0 : 1)}억 톤`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString()}만 톤`;
  return `${Math.round(value).toLocaleString()}톤`;
}

export function HtmlLessonQuiz({
  quiz,
  disabled,
  submit,
  onGraded,
}: {
  quiz: Quiz;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
}) {
  const kind = quiz.options?.mockHtmlType as HtmlKind;
  const choices = (quiz.options?.choices ?? []) as Choice[];
  const left = (quiz.options?.left ?? []) as string[];
  const right = (quiz.options?.right ?? []) as string[];
  const [chosen, setChosen] = useState<number[]>([]);
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [exponent, setExponent] = useState(3);
  const [touched, setTouched] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(1);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checked = !!result || disabled;
  const ready =
    kind === 'range'
      ? touched
      : kind === 'match'
        ? Object.keys(pairs).length === left.length
        : chosen.length > 0;
  const choose = (index: number) => {
    if (checked) return;
    setChosen((previous) =>
      kind === 'multi'
        ? previous.includes(index)
          ? previous.filter((item) => item !== index)
          : [...previous, index]
        : [index],
    );
  };
  const moveSlider = (x: number) => {
    if (checked) return;
    setExponent(Math.round(Math.max(0, Math.min(9, (x / sliderWidth) * 9)) * 10) / 10);
    setTouched(true);
  };
  const check = async () => {
    if (!ready || checked || busy) return;
    const answer: QuizAnswer =
      kind === 'range'
        ? { texts: [String(exponent)] }
        : kind === 'match'
          ? { order: left.map((_, index) => pairs[index]) }
          : kind === 'multi'
            ? { texts: chosen.map(String) }
            : kind === 'ox'
              ? { value: chosen[0] === 0 }
              : { index: chosen[0] };
    setBusy(true);
    setError('');
    try {
      const graded = await submit(answer);
      setResult(graded);
      onGraded(graded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const setPair = (index: number) => {
    if (checked || activeLeft === null) return;
    setPairs((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(next))
        if (next[Number(key)] === index) delete next[Number(key)];
      next[activeLeft] = index;
      return next;
    });
    setActiveLeft(null);
  };
  return (
    <View style={s.page}>
      <Text style={s.question}>
        {kind === 'blank' ? (
          <>
            태양이 계속 빛나려면{'\n'}
            <Text style={s.blank}>{chosen.length ? choices[chosen[0]]?.label : '?'}</Text> 있어야
            해요.
          </>
        ) : (
          quiz.question
        )}
      </Text>
      {kind === 'range' ? (
        <View style={s.rangeArea}>
          <Text style={s.rangeValue}>{formatMass(10 ** exponent)}</Text>
          <View
            style={s.sliderTouch}
            onLayout={(event: LayoutChangeEvent) => setSliderWidth(event.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => !checked}
            onMoveShouldSetResponder={() => !checked}
            onResponderGrant={(event) => moveSlider(event.nativeEvent.locationX)}
            onResponderMove={(event) => moveSlider(event.nativeEvent.locationX)}
          >
            <View style={s.sliderTrack}>
              <View style={[s.sliderFill, { width: `${(exponent / 9) * 100}%` }]} />
            </View>
            <View style={[s.sliderThumb, { left: `${(exponent / 9) * 100}%` }]} />
          </View>
          <View style={s.ticks}>
            {['1톤', '1천 톤', '100만 톤', '10억 톤'].map((tick) => (
              <Text key={tick} style={s.tick}>
                {tick}
              </Text>
            ))}
          </View>
        </View>
      ) : kind === 'match' ? (
        <View style={s.matchGrid}>
          {left.map((label, index) => {
            const paired = pairs[index];
            return (
              <View key={label} style={s.matchRow}>
                <Option
                  label={`${label}${paired !== undefined ? ` ${String.fromCharCode(65 + index)}` : ''}`}
                  selected={activeLeft === index}
                  matched={paired !== undefined}
                  disabled={checked}
                  onPress={() => setActiveLeft(index)}
                />
                <Option
                  label={`${right[index]}${Object.values(pairs).includes(index) ? ` ${String.fromCharCode(65 + Number(Object.keys(pairs).find((key) => pairs[Number(key)] === index)))}` : ''}`}
                  matched={Object.values(pairs).includes(index)}
                  disabled={checked}
                  onPress={() => setPair(index)}
                />
              </View>
            );
          })}
        </View>
      ) : (
        <View style={kind === 'ox' ? s.oxRow : s.options}>
          {choices.map((choice) => (
            <Option
              key={choice.index}
              label={`${kind === 'multi' ? '◌　' : ''}${choice.label}`}
              selected={chosen.includes(choice.index)}
              correct={
                result ? ((quiz.options?.answer as number[]) ?? []).includes(choice.index) : false
              }
              wrong={
                !!result &&
                chosen.includes(choice.index) &&
                !((quiz.options?.answer as number[]) ?? []).includes(choice.index)
              }
              ox={kind === 'ox'}
              disabled={checked}
              onPress={() => choose(choice.index)}
            />
          ))}
        </View>
      )}
      {result ? (
        <View style={[s.feedback, result.isCorrect && s.feedbackGood]}>
          <Text style={s.feedbackTitle}>
            {kind === 'range'
              ? '태양이 바꾸는 질량은 약 400만 톤이에요.'
              : result.isCorrect
                ? '맞았어요!'
                : '함께 확인해 볼까요?'}
          </Text>
          <Text style={s.feedbackText}>{result.explanation}</Text>
        </View>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      {!result ? (
        <Pressable
          accessibilityRole="button"
          disabled={!ready || busy || disabled}
          onPress={() => void check()}
          style={[s.check, (!ready || busy || disabled) && s.checkDisabled]}
        >
          <Text style={s.checkText}>정답 확인</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Option({
  label,
  selected = false,
  correct = false,
  wrong = false,
  matched = false,
  ox = false,
  disabled,
  onPress,
}: {
  label: string;
  selected?: boolean;
  correct?: boolean;
  wrong?: boolean;
  matched?: boolean;
  ox?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.option,
        selected && s.selected,
        matched && s.matched,
        correct && s.correct,
        wrong && s.wrong,
        ox && s.ox,
      ]}
    >
      <Text style={[s.optionText, ox && s.oxText]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { flexGrow: 1, gap: 15 },
  question: {
    color: '#282636',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 38,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 15,
  },
  blank: { color: '#746284', textDecorationLine: 'underline' },
  options: { gap: 10 },
  option: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#e6e0ec',
    borderRadius: 13,
    backgroundColor: '#fff',
    padding: 14,
    justifyContent: 'center',
  },
  optionText: { color: '#282636', fontSize: 14 },
  selected: { borderColor: '#746287', backgroundColor: '#f4f0f8' },
  correct: { borderColor: '#83ac92', backgroundColor: '#eff7f1' },
  wrong: { borderColor: '#d3a4a4', backgroundColor: '#fdf1f1' },
  oxRow: { flexDirection: 'row', gap: 20, justifyContent: 'center' },
  ox: { maxWidth: 140, height: 140, borderColor: 'transparent', alignItems: 'center' },
  oxText: { color: '#a29ca8', fontSize: 70, fontWeight: '200' },
  matchGrid: { gap: 10 },
  matchRow: { flexDirection: 'row', gap: 10 },
  matched: { opacity: 0.5, backgroundColor: '#eef6f0' },
  rangeArea: { gap: 15 },
  rangeValue: { color: '#746284', fontSize: 31, fontWeight: '600', textAlign: 'center' },
  sliderTouch: { height: 38, justifyContent: 'center' },
  sliderTrack: { height: 5, backgroundColor: '#e9e5ef', borderRadius: 5 },
  sliderFill: { height: 5, backgroundColor: '#827094', borderRadius: 5 },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#827094',
    marginLeft: -10,
  },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { color: '#aaa1b3', fontSize: 11 },
  feedback: {
    marginTop: 'auto',
    backgroundColor: '#f5f3f8',
    borderRadius: 14,
    padding: 17,
    gap: 5,
  },
  feedbackGood: { backgroundColor: '#f0f6f1' },
  feedbackTitle: { color: '#282636', fontWeight: '700', fontSize: 13 },
  feedbackText: { color: '#282636', fontSize: 13, lineHeight: 23 },
  check: {
    marginTop: 'auto',
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: '#302b38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDisabled: { opacity: 0.38 },
  checkText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  error: { color: '#b56060', fontSize: 12 },
});
