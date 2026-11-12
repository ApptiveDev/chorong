import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { useTask } from '../hooks';
import { UserStatus } from './Screen';

type Presentation = {
  type: 'AUDIO' | 'TILE' | 'ZOOM_OUT' | 'SHARPEN' | 'INLINE_WORD';
  mediaUrl?: string;
  stages?: number[];
  rows?: number;
  columns?: number;
};

function words(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function presentationOf(config: Record<string, unknown>): Presentation | null {
  const value = config.presentation;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Presentation;
}

export function QuizCard({
  quiz,
  submit,
  onGraded,
  disabled = false,
}: {
  quiz: Quiz;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  disabled?: boolean;
}) {
  const task = useTask();
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedMany, setSelectedMany] = useState<number[]>([]);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const [sliderWidth, setSliderWidth] = useState(1);
  const [typed, setTyped] = useState('');
  const [stage, setStage] = useState(0);
  const [ox, setOx] = useState<boolean | null>(null);
  const [rightSelections, setRightSelections] = useState<string[]>([]);
  const config = quiz.config;
  const options = words(config.options);
  const ticks = words(config.ticks);
  const pairs = Array.isArray(config.pairs) ? (config.pairs as string[][]) : [];
  const rightChoices = pairs.map((pair) => pair[1]).reverse();
  const presentation = quiz.interactionType === 'SINGLE' ? presentationOf(config) : null;
  const stages = presentation?.stages ?? [];
  const stageValue = stages[stage];
  const locked = disabled || task.busy || !!task.result;
  const canAdvanceStage = stage < stages.length - 1 && !locked;
  const isInline = presentation?.type === 'INLINE_WORD';

  const answer = (): QuizAnswer => {
    switch (quiz.interactionType) {
      case 'OX':
        if (ox === null) throw new Error('O 또는 X를 고르세요.');
        return { answer: ox };
      case 'SINGLE':
      case 'BLANK':
        if (selected === null) throw new Error('답을 고르세요.');
        return { answer: selected };
      case 'MULTI':
        if (!selectedMany.length) throw new Error('답을 고르세요.');
        return { answers: [...selectedMany].sort((a, b) => a - b) };
      case 'CHOSUNG':
        if (!typed.trim()) throw new Error('답을 입력하세요.');
        return { answer: typed.trim() };
      case 'SLIDER':
        if (sliderValue === null) throw new Error('위치를 고르세요.');
        return { answer: sliderValue };
      case 'MATCH':
        if (rightSelections.length !== pairs.length || rightSelections.some((value) => !value))
          throw new Error('모든 짝을 고르세요.');
        return { pairs: pairs.map(([left], index) => [left, rightSelections[index]]) };
    }
  };

  const choice = (label: string, active: boolean, onPress: () => void, key: string | number) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={[s.choice, active && s.active]}
    >
      <Text style={s.choiceText}>{label}</Text>
    </Pressable>
  );

  const stageLabel = () => {
    if (presentation?.type === 'TILE') return `타일 ${stageValue}개`;
    if (presentation?.type === 'ZOOM_OUT') return `${stageValue}배 확대`;
    if (presentation?.type === 'SHARPEN') return `${stage + 1}단계`;
    return '';
  };

  return (
    <View style={s.container}>
      <Text style={s.question}>{quiz.question}</Text>
      <Text style={s.instruction}>{quiz.instruction}</Text>
      {quiz.interactionType === 'CHOSUNG' ? (
        <>
          <Text style={s.hint}>{String(config.hint ?? '')}</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            editable={!locked}
            placeholder="정답 입력"
            style={s.input}
            autoCorrect={false}
          />
        </>
      ) : null}
      {presentation?.type === 'AUDIO' ? (
        <View style={s.mediaPanel}>
          <Text style={s.audioIcon}>▶</Text>
          <Text style={s.instruction}>소리 재생은 준비 중입니다.</Text>
        </View>
      ) : null}
      {presentation && ['TILE', 'ZOOM_OUT', 'SHARPEN'].includes(presentation.type) ? (
        <>
          <View style={s.imageFrame}>
            <Image
              source={{ uri: presentation.mediaUrl }}
              style={[
                s.image,
                presentation.type === 'ZOOM_OUT' && { transform: [{ scale: stageValue ?? 1 }] },
              ]}
              resizeMode="cover"
              blurRadius={presentation.type === 'SHARPEN' ? (stageValue ?? 0) : 0}
            />
            {presentation.type === 'TILE' ? (
              <View style={s.tileGrid}>
                {Array.from(
                  { length: (presentation.rows ?? 0) * (presentation.columns ?? 0) },
                  (_, i) => (
                    <View
                      key={i}
                      style={{
                        width: `${100 / (presentation.columns ?? 1)}%`,
                        height: `${100 / (presentation.rows ?? 1)}%`,
                        backgroundColor: i < (stageValue ?? 0) ? 'transparent' : '#e8e8e8',
                        borderWidth: i < (stageValue ?? 0) ? 0 : 1,
                        borderColor: '#fff',
                      }}
                    />
                  ),
                )}
              </View>
            ) : null}
          </View>
          <Text style={s.stage}>{stageLabel()}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={!canAdvanceStage}
            onPress={() => setStage((current) => current + 1)}
            style={[s.stageButton, !canAdvanceStage && s.disabled]}
          >
            <Text style={s.buttonText}>
              {presentation.type === 'TILE'
                ? '타일 더 벗기기'
                : presentation.type === 'ZOOM_OUT'
                  ? '축소하기'
                  : '선명하게 하기'}
            </Text>
          </Pressable>
        </>
      ) : null}
      {quiz.interactionType === 'BLANK' ? (
        <Text style={s.question}>
          {String(config.before ?? '')} ___ {String(config.after ?? '')}
        </Text>
      ) : null}
      {quiz.interactionType === 'OX' ? (
        <View style={s.row}>
          {choice('O', ox === true, () => setOx(true), 'o')}
          {choice('X', ox === false, () => setOx(false), 'x')}
        </View>
      ) : null}
      {quiz.interactionType === 'SINGLE' || quiz.interactionType === 'BLANK' ? (
        <View style={isInline ? s.inline : s.options}>
          {options.map((item, index) =>
            choice(item, selected === index, () => setSelected(index), index),
          )}
        </View>
      ) : null}
      {quiz.interactionType === 'MULTI' ? (
        <View style={s.options}>
          {options.map((item, index) =>
            choice(
              item,
              selectedMany.includes(index),
              () =>
                setSelectedMany((old) =>
                  old.includes(index) ? old.filter((i) => i !== index) : [...old, index],
                ),
              index,
            ),
          )}
        </View>
      ) : null}
      {quiz.interactionType === 'SLIDER' ? (
        <View style={s.options}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityValue={{ min: 0, max: 100, now: Math.round((sliderValue ?? 0) * 100) }}
            disabled={locked}
            onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
            onPress={(event) =>
              setSliderValue(Math.max(0, Math.min(1, event.nativeEvent.locationX / sliderWidth)))
            }
            style={s.sliderTrack}
          >
            {sliderValue !== null ? (
              <View style={[s.sliderThumb, { left: `${sliderValue * 100}%` }]} />
            ) : null}
          </Pressable>
          <View style={s.sliderTicks}>
            {ticks.map((item, index) => (
              <Text key={index} style={s.sliderTick}>
                {item}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {quiz.interactionType === 'MATCH' ? (
        <View style={s.options}>
          {pairs.map(([left], index) => (
            <View key={left} style={s.matchRow}>
              <Text style={s.choiceText}>{left}</Text>
              {choice(
                rightSelections[index] ?? '짝 고르기',
                !!rightSelections[index],
                () => {
                  const used = new Set(rightSelections.filter((_, i) => i !== index));
                  const next = rightChoices.find(
                    (value) => !used.has(value) && value !== rightSelections[index],
                  );
                  const values = [...rightSelections];
                  values[index] = next ?? '';
                  setRightSelections(values);
                },
                index,
              )}
            </View>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={locked || presentation?.type === 'AUDIO'}
        onPress={() => void task.run(() => submit(answer()), onGraded)}
        style={[s.submit, (locked || presentation?.type === 'AUDIO') && s.disabled]}
      >
        <Text style={s.buttonText}>정답 확인</Text>
      </Pressable>
      <UserStatus task={task} />
      {task.result ? (
        <View style={s.result}>
          <Text style={s.resultTitle}>
            {(task.result as AnswerResult).isCorrect ? '정답' : '오답'}
          </Text>
          {presentation && stages.length > 0 ? (
            <Text style={s.stage}>
              {presentation.type === 'TILE'
                ? `타일 ${stageValue}개만 벗기고 ${(task.result as AnswerResult).isCorrect ? '맞혔어요' : '답했어요'}.`
                : `${stageLabel()}에서 ${(task.result as AnswerResult).isCorrect ? '맞혔어요' : '답했어요'}.`}
            </Text>
          ) : null}
          {(task.result as AnswerResult).explanation ? (
            <Text style={s.explanation}>{(task.result as AnswerResult).explanation}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 14, padding: 16, backgroundColor: '#fff' },
  question: {
    color: '#171717',
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 31,
    textAlign: 'center',
  },
  instruction: { color: '#666', fontSize: 14, textAlign: 'center' },
  hint: {
    color: '#171717',
    fontSize: 32,
    letterSpacing: 8,
    textAlign: 'center',
    marginVertical: 20,
  },
  input: {
    minHeight: 52,
    borderBottomWidth: 2,
    borderColor: '#171717',
    fontSize: 20,
    textAlign: 'center',
  },
  mediaPanel: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f4f4',
    gap: 18,
  },
  audioIcon: { fontSize: 46, color: '#171717' },
  imageFrame: { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: '#eee' },
  image: { width: '100%', height: '100%' },
  tileGrid: { ...StyleSheet.absoluteFill, flexDirection: 'row', flexWrap: 'wrap' },
  stage: { color: '#555', fontSize: 14, textAlign: 'center' },
  stageButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#555',
  },
  row: { flexDirection: 'row', gap: 8 },
  sliderTrack: {
    height: 44,
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderColor: '#171717',
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#171717',
    bottom: -11,
  },
  sliderTicks: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderTick: { color: '#666', fontSize: 12 },
  options: { gap: 8 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  choice: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d7d7d7',
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  active: { borderColor: '#171717', backgroundColor: '#eee' },
  choiceText: { color: '#171717', fontSize: 16 },
  matchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  submit: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171717',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  result: { backgroundColor: '#f4f4f4', padding: 18, gap: 8 },
  resultTitle: { color: '#171717', fontSize: 22, fontWeight: '700' },
  explanation: { color: '#333', fontSize: 15, lineHeight: 23 },
});
