import type { Quiz, QuizResponse } from '../../types/quiz';
import { DragDropQuiz } from './DragDropQuiz';
import { FlipCardQuiz } from './FlipCardQuiz';
import { MatchingQuiz } from './MatchingQuiz';
import { SelectionQuiz } from './SelectionQuiz';
import { SliderQuiz } from './SliderQuiz';
import { SortQuiz } from './SortQuiz';
import { SwipeQuiz } from './SwipeQuiz';

export function QuizRenderer({
  quiz,
  response,
  onChange,
  disabled,
}: {
  quiz: Quiz;
  response: QuizResponse;
  onChange: (response: QuizResponse) => void;
  disabled: boolean;
}) {
  switch (quiz.interactionType) {
    case 'MULTIPLE_CHOICE':
      return (
        <SelectionQuiz
          config={quiz.config}
          items={quiz.config.options}
          selected={'selectedOptionIds' in response ? response.selectedOptionIds : []}
          onChange={(selectedOptionIds) => onChange({ selectedOptionIds })}
          disabled={disabled}
        />
      );
    case 'TAP':
      return (
        <SelectionQuiz
          config={quiz.config}
          items={quiz.config.items}
          selected={'selectedItemIds' in response ? response.selectedItemIds : []}
          onChange={(selectedItemIds) => onChange({ selectedItemIds })}
          disabled={disabled}
        />
      );
    case 'SLIDER':
      return (
        <SliderQuiz
          config={quiz.config}
          value={
            'value' in response && typeof response.value === 'number'
              ? response.value
              : quiz.config.min
          }
          onChange={(value) => onChange({ value })}
          disabled={disabled}
        />
      );
    case 'SWIPE':
      return (
        <SwipeQuiz
          config={quiz.config}
          value={'value' in response && typeof response.value === 'string' ? response.value : ''}
          onChange={(value) => onChange({ value })}
          disabled={disabled}
        />
      );
    case 'FLIP_CARD':
      return (
        <FlipCardQuiz
          config={quiz.config}
          flipped={'flipped' in response && response.flipped}
          onChange={(flipped) => onChange({ flipped })}
          disabled={disabled}
        />
      );
    case 'DRAG_DROP':
      return (
        <DragDropQuiz
          config={quiz.config}
          placements={'placements' in response ? response.placements : {}}
          onChange={(placements) => onChange({ placements })}
          disabled={disabled}
        />
      );
    case 'SORT':
      return (
        <SortQuiz
          config={quiz.config}
          order={'order' in response ? response.order : []}
          onChange={(order) => onChange({ order })}
          disabled={disabled}
        />
      );
    case 'MATCHING':
      return (
        <MatchingQuiz
          config={quiz.config}
          matches={'matches' in response ? response.matches : {}}
          onChange={(matches) => onChange({ matches })}
          disabled={disabled}
        />
      );
  }
}
