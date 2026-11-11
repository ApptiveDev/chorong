import { prepareQuiz, responseIssue } from './quiz-state';
import type { QuizPreviewResult, QuizResponse, QuizSummary } from '../types/quiz';

// 학습 와이어프레임 전용 문제다. Real 모드의 개발용 퀴즈 API 계약은 변경하지 않는다.
export const mockLessonQuizzes: QuizSummary[] = [
  {
    quizId: 411,
    lessonId: 41,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'MULTIPLE_CHOICE',
    question: '시장 금리가 오르면 기존 고정금리 채권의 가격은 보통 어떻게 될까요?',
    instruction: '알맞은 답을 선택하세요.',
    config: {
      selectionType: 'SINGLE',
      options: [
        { id: 'down', text: '내려가요' },
        { id: 'up', text: '올라가요' },
      ],
    },
  },
  {
    quizId: 511,
    lessonId: 51,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'TAP',
    question: '모나리자의 부드러운 명암을 표현한 기법은 무엇일까요?',
    instruction: '맞는 카드를 탭하세요.',
    config: {
      selectionType: 'SINGLE',
      items: [
        { id: 'fresco', text: '프레스코' },
        { id: 'sfumato', text: '스푸마토' },
        { id: 'collage', text: '콜라주' },
      ],
    },
  },
  {
    quizId: 611,
    lessonId: 61,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'SORT',
    question: '이어웜이 생기는 흐름을 순서대로 놓아 보세요.',
    instruction: '카드를 끌거나 위·아래 버튼으로 순서를 바꾸세요.',
    config: {
      items: [
        { id: 'repeat', text: '머릿속에서 반복' },
        { id: 'hear', text: '멜로디를 들음' },
        { id: 'remember', text: '기억에 남음' },
      ],
    },
  },
  {
    quizId: 711,
    lessonId: 71,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'MATCHING',
    question: '고양이와 사람의 단맛 감각을 연결해 보세요.',
    instruction: '왼쪽과 오른쪽 항목을 짝지으세요.',
    config: {
      leftItems: [
        { id: 'cat', text: '고양이' },
        { id: 'human', text: '사람' },
      ],
      rightItems: [
        { id: 'sweet', text: '단맛을 느낌' },
        { id: 'little', text: '단맛을 거의 느끼지 못함' },
      ],
    },
  },
  {
    quizId: 811,
    lessonId: 81,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'DRAG_DROP',
    question: '태양의 핵융합에서 시작 물질과 만들어지는 물질을 놓아 보세요.',
    instruction: '물질 카드를 알맞은 영역에 끌어 놓으세요.',
    config: {
      items: [
        { id: 'hydrogen', text: '수소' },
        { id: 'helium', text: '헬륨' },
      ],
      targets: [
        { id: 'input', text: '시작 물질' },
        { id: 'output', text: '만들어지는 물질' },
      ],
    },
  },
  {
    quizId: 911,
    lessonId: 91,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'MULTIPLE_CHOICE',
    question: '녹음한 내 목소리가 낯설게 들리는 이유는 무엇일까요?',
    instruction: '알맞은 답을 선택하세요.',
    config: {
      selectionType: 'SINGLE',
      options: [
        { id: 'air', text: '녹음할 때는 공기 전도 소리를 주로 듣기 때문' },
        { id: 'speed', text: '녹음할 때 목소리가 항상 빨라지기 때문' },
        { id: 'volume', text: '녹음하면 소리가 모두 같은 높이가 되기 때문' },
      ],
    },
  },
  {
    quizId: 1011,
    lessonId: 101,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'FLIP_CARD',
    question: '달걀 껍데기에 작용하는 힘의 짝을 찾아보세요.',
    instruction: '카드 두 장씩 뒤집어 관련 있는 내용을 연결하세요.',
    config: {
      cards: [
        { id: 'curve', text: '곡면' },
        { id: 'break', text: '깨지기 쉬움' },
        { id: 'point', text: '한 점에 힘 집중' },
        { id: 'spread', text: '힘 분산' },
      ],
    },
  },
  {
    quizId: 1111,
    lessonId: 111,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'SLIDER',
    question:
      '두 지역의 그림자 각도 차이가 한 바퀴의 1/50이면, 지역 사이 거리를 몇 배 해야 지구 둘레가 될까요?',
    instruction: '슬라이더를 움직여 배수를 선택하세요.',
    config: { min: 0, max: 60, step: 1, initialValue: 0, unit: '배', showValue: true },
  },
  {
    quizId: 1211,
    lessonId: 121,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'TAP',
    question: '어느 방향으로 돌려도 폭이 같은 모양은 무엇일까요?',
    instruction: '맞는 모양을 탭하세요.',
    config: {
      selectionType: 'SINGLE',
      items: [
        { id: 'square', text: '정사각형' },
        { id: 'circle', text: '원' },
        { id: 'triangle', text: '삼각형' },
      ],
    },
  },
  {
    quizId: 1311,
    lessonId: 131,
    quizOrder: 1,
    difficulty: 'EASY',
    interactionType: 'MULTIPLE_CHOICE',
    question: '부정성 편향은 어떤 경향을 말할까요?',
    instruction: '알맞은 설명을 선택하세요.',
    config: {
      selectionType: 'SINGLE',
      options: [
        { id: 'negative', text: '부정적인 일에 더 주의를 기울이고 오래 기억함' },
        { id: 'forget', text: '모든 일을 똑같은 속도로 잊어버림' },
        { id: 'positive', text: '좋은 일만 기억하고 나쁜 일은 잊음' },
      ],
    },
  },
];

const answers: Record<number, QuizResponse> = {
  411: { selectedOptionIds: ['down'] },
  511: { selectedItemIds: ['sfumato'] },
  611: { order: ['hear', 'remember', 'repeat'] },
  711: { matches: { cat: 'little', human: 'sweet' } },
  811: { placements: { hydrogen: 'input', helium: 'output' } },
  911: { selectedOptionIds: ['air'] },
  1011: {
    pairs: [
      { firstCardId: 'curve', secondCardId: 'spread' },
      { firstCardId: 'point', secondCardId: 'break' },
    ],
  },
  1111: { value: 50 },
  1211: { selectedItemIds: ['circle'] },
  1311: { selectedOptionIds: ['negative'] },
};

export const mockQuizForLesson = (lessonId: number) =>
  mockLessonQuizzes.filter((quiz) => quiz.lessonId === lessonId);

const sameItems = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value) => right.includes(value));
const sameMap = (left: Record<string, string>, right: Record<string, string>) =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(right).every(([key, value]) => left[key] === value);

export function checkMockQuiz(quizId: number, response: QuizResponse): QuizPreviewResult {
  const raw = mockLessonQuizzes.find((quiz) => quiz.quizId === quizId);
  if (!raw) throw new Error('Mock 퀴즈를 찾을 수 없습니다.');
  const quiz = prepareQuiz(raw);
  const issue = responseIssue(quiz, response);
  if (issue && quiz.interactionType !== 'FLIP_CARD') throw new Error(issue);
  const expected = answers[quizId];
  let correct = false;
  if ('selectedItemIds' in response && 'selectedItemIds' in expected)
    correct = sameItems(response.selectedItemIds, expected.selectedItemIds);
  else if ('selectedOptionIds' in response && 'selectedOptionIds' in expected)
    correct = sameItems(response.selectedOptionIds, expected.selectedOptionIds);
  else if ('order' in response && 'order' in expected)
    correct = response.order.join('|') === expected.order.join('|');
  else if ('matches' in response && 'matches' in expected)
    correct = sameMap(response.matches, expected.matches);
  else if ('placements' in response && 'placements' in expected)
    correct = sameMap(response.placements, expected.placements);
  else if ('value' in response && 'value' in expected) correct = response.value === expected.value;
  else if ('pairs' in response && 'pairs' in expected) {
    const expectedPairs = expected.pairs.map((pair) => [pair.firstCardId, pair.secondCardId]);
    const used = response.pairs.flatMap((pair) => [pair.firstCardId, pair.secondCardId]);
    correct =
      new Set(used).size === used.length &&
      response.pairs.every((pair) =>
        expectedPairs.some(
          ([first, second]) =>
            (pair.firstCardId === first && pair.secondCardId === second) ||
            (pair.firstCardId === second && pair.secondCardId === first),
        ),
      );
  }
  const completed = correct && (quiz.interactionType !== 'FLIP_CARD' || !issue);
  return {
    graded: true,
    correct,
    completed,
    explanation: correct ? '학습 내용을 확인했습니다.' : '카드를 다시 조작해 보세요.',
  };
}
