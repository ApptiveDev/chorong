export type QuizConfigOptions = { shuffle?: boolean; allowRetry?: true; showHint?: false };
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
  FLIP_CARD: { cards: QuizItem[] };
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
    config: QuizConfigs[K] & QuizConfigOptions;
  };
}[InteractionType];
export type SliderUserResponse = { value: number };
export type SwipeUserResponse = { value: string };
export type TapUserResponse = { selectedItemIds: string[] };
export type MultipleChoiceUserResponse = { selectedOptionIds: string[] };
export type DragDropUserResponse = { placements: Record<string, string> };
export type SortUserResponse = { order: string[] };
export type MatchingUserResponse = { matches: Record<string, string> };
export type CardPair = { firstCardId: string; secondCardId: string };
export type FlipCardUserResponse = { pairs: CardPair[] };
export type QuizUserResponses = {
  SLIDER: SliderUserResponse;
  SWIPE: SwipeUserResponse;
  TAP: TapUserResponse;
  MULTIPLE_CHOICE: MultipleChoiceUserResponse;
  DRAG_DROP: DragDropUserResponse;
  SORT: SortUserResponse;
  MATCHING: MatchingUserResponse;
  FLIP_CARD: FlipCardUserResponse;
};
export type QuizResponse = QuizUserResponses[InteractionType];
export type QuizPreviewResult = {
  graded: boolean;
  correct: boolean | null;
  completed: boolean;
  explanation: string;
};
