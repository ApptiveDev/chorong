export type QuizItem = { id: string; text?: string; imageUrl?: string };
export type CardFace = { title?: string; text?: string; imageUrl?: string };
export type SliderConfig = {
  min: number;
  max: number;
  step: number;
  initialValue?: number;
  unit?: string;
  showValue?: boolean;
};
export type SelectionConfig = { selectionType: 'SINGLE' | 'MULTIPLE'; maxSelections?: number };
export type QuizConfigs = {
  SLIDER: SliderConfig;
  SWIPE: { left: { value: string; label: string }; right: { value: string; label: string } };
  TAP: SelectionConfig & { items: QuizItem[] };
  MULTIPLE_CHOICE: SelectionConfig & { options: QuizItem[] };
  DRAG_DROP: { items: QuizItem[]; targets: QuizItem[] };
  SORT: { items: QuizItem[] };
  MATCHING: { leftItems: QuizItem[]; rightItems: QuizItem[] };
  FLIP_CARD: { front: CardFace; back: CardFace };
};
export type InteractionType = keyof QuizConfigs;
export type QuizSummary = {
  quizId: number;
  lessonId: number;
  question: string;
  instruction: string;
  interactionType: string;
  config: unknown;
  difficulty: string;
  quizOrder: number;
};
export type Quiz = {
  [K in InteractionType]: Omit<QuizSummary, 'interactionType' | 'config'> & {
    interactionType: K;
    config: QuizConfigs[K] & { shuffle?: boolean };
  };
}[InteractionType];
export type QuizResponse =
  | { value: number | string }
  | { selectedItemIds: string[] }
  | { selectedOptionIds: string[] }
  | { placements: Record<string, string> }
  | { order: string[] }
  | { matches: Record<string, string> }
  | { flipped: boolean };
export type QuizPreviewResult = {
  graded: boolean;
  correct: boolean | null;
  completed: boolean;
  explanation: string;
};
