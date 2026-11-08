import { useEffect, useRef } from 'react';

export type RegisterQuizFooter = (quizId: number, enabled: boolean, onPress: () => void) => void;

export function useQuizFooter(
  quizId: number,
  enabled: boolean,
  onPress: () => void,
  register?: RegisterQuizFooter,
) {
  const action = useRef(onPress);
  action.current = onPress;
  useEffect(() => {
    register?.(quizId, enabled, () => action.current());
  }, [quizId, enabled, register]);
}
