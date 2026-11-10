-- 복습 풀·복습 세션 문항은 ON DELETE CASCADE, 레슨 진행의 last_content_id 는 ON DELETE SET NULL 로 함께 정리된다.
DELETE FROM quiz_attempt
WHERE quiz_id IN (SELECT quiz_id FROM quiz_item WHERE interaction_type = 'SWIPE');

DELETE FROM lesson_content
WHERE quiz_id IN (SELECT quiz_id FROM quiz_item WHERE interaction_type = 'SWIPE');

DELETE FROM quiz_item WHERE interaction_type = 'SWIPE';

ALTER TABLE quiz_item DROP CONSTRAINT ck_quiz_item_interaction_type;
ALTER TABLE quiz_item ADD CONSTRAINT ck_quiz_item_interaction_type CHECK (
    interaction_type IN ('SLIDER', 'TAP', 'DRAG_DROP', 'SORT', 'MATCHING', 'FLIP_CARD', 'MULTIPLE_CHOICE')
);
