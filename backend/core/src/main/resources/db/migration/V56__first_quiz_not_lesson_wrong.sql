-- 0.4.1 이전에는 학습 레슨의 첫 퀴즈도 채점했다. V51 이 그 오답을 "레슨에서 틀림"으로 옮겼으므로 되돌린다.
-- 첫 퀴즈는 채점하지 않으며 복습 후보와 레슨 오답 집계에 넣지 않는다(API-406, API-501). 온보딩 퀴즈는 모두 채점하므로 그대로 둔다.
UPDATE quiz_review_pool p
SET lesson_wrong = FALSE
WHERE p.lesson_wrong
  AND p.quiz_id IN (
      SELECT first.quiz_id
      FROM (
          SELECT DISTINCT ON (lc.lesson_id) lc.lesson_id, lc.quiz_id
          FROM lesson_content lc
          WHERE lc.quiz_id IS NOT NULL
          ORDER BY lc.lesson_id, lc.content_order, lc.content_id
      ) first
      JOIN lesson l ON l.lesson_id = first.lesson_id
      JOIN course c ON c.course_id = l.course_id
      WHERE NOT c.is_onboarding
  );
