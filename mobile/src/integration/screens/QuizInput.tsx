import { useState } from 'react';
import { Text, View } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { useTask } from '../hooks';
import { Button, Choices, Field, Json, styles, TaskStatus } from '../ui';

export function QuizInput({
  quiz,
  submit,
  onAnswered,
  disabled = false,
}: {
  quiz: Quiz;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onAnswered?: (result: AnswerResult) => void;
  disabled?: boolean;
}) {
  const [index, setIndex] = useState(''),
    [texts, setTexts] = useState(''),
    [ox, setOx] = useState<'O' | 'X' | ''>(''),
    [order, setOrder] = useState('');
  const task = useTask();
  const choices = quiz.options?.choices;
  const answer = (): QuizAnswer => {
    switch (quiz.type) {
      case 'MULTIPLE_CHOICE': {
        const n = Number(index);
        if (!/^-?\d+$/.test(index) || !Number.isSafeInteger(n))
          throw new Error('선택지 index 정수를 입력하세요.');
        return { index: n };
      }
      case 'FILL_BLANK':
        if (!texts.trim()) throw new Error('빈칸 답을 입력하세요.');
        return { texts: texts.split('\n') };
      case 'CHOSUNG':
        if (!texts.trim()) throw new Error('초성 답을 입력하세요.');
        return { texts: [texts] };
      case 'SLIDER': {
        const position = Number(texts);
        if (!texts.trim() || !(position >= 0 && position <= 1))
          throw new Error('0~1 사이 위치를 입력하세요.');
        return { position };
      }
      case 'OX':
        if (!ox) throw new Error('O 또는 X를 선택하세요.');
        return { value: ox === 'O' };
      case 'ORDERING': {
        const values = order.split(',').map((v) => v.trim());
        if (
          !values.length ||
          values.some((v) => !/^-?\d+$/.test(v) || !Number.isSafeInteger(Number(v)))
        )
          throw new Error('정수 배열을 쉼표로 구분해 입력하세요.');
        return { order: values.map(Number) };
      }
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.subtitle}>{quiz.question}</Text>
      <Text>
        유형: {quiz.type} · quizId={quiz.quizId}
      </Text>
      {quiz.hint ? <Text style={styles.text}>힌트: {quiz.hint}</Text> : null}
      {quiz.type === 'MULTIPLE_CHOICE' ? (
        <>
          <Json value={choices ?? quiz.options} />
          <Text style={styles.text}>
            명세에 선택지 내부 구조와 index 시작값이 없습니다. 서버 데이터의 index를 확인해
            입력하세요.
          </Text>
          <Field label="선택지 index" value={index} onChange={setIndex} numeric />
        </>
      ) : null}
      {quiz.type === 'FILL_BLANK' ? (
        <Field label="빈칸 답 (한 줄에 하나씩)" value={texts} onChange={setTexts} multiline />
      ) : null}
      {quiz.type === 'CHOSUNG' ? (
        <Field
          label={`초성 답 (힌트: ${String(quiz.options?.hint ?? '')})`}
          value={texts}
          onChange={setTexts}
        />
      ) : null}
      {quiz.type === 'SLIDER' ? (
        <>
          <Json value={quiz.options} />
          <Field label="트랙 위치 (0~1)" value={texts} onChange={setTexts} />
        </>
      ) : null}
      {quiz.type === 'OX' ? <Choices values={['O', 'X']} value={ox} onChange={setOx} /> : null}
      {quiz.type === 'ORDERING' ? (
        <>
          <Json value={quiz.options?.items ?? quiz.options} />
          <Text style={styles.text}>
            order 원소가 ID인지 위치인지 명세 확인이 필요합니다. 서버 계약을 확인한 정수 순서를
            입력하세요.
          </Text>
          <Field label="순서 (쉼표로 구분한 정수)" value={order} onChange={setOrder} />
        </>
      ) : null}
      <Button
        title="답안 제출·채점 확인"
        disabled={disabled || task.busy}
        onPress={() => void task.run(() => submit(answer()), onAnswered)}
      />
      <TaskStatus task={task} />
      {task.result ? (
        <Text style={styles.text}>
          {(task.result as AnswerResult).isCorrect ? '정답' : '오답'} ·{' '}
          {(task.result as AnswerResult).explanation}
        </Text>
      ) : null}
    </View>
  );
}
