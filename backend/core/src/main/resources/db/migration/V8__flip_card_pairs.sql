-- 기존 FLIP_CARD의 NULL 답안을 유지하면서 새 짝 맞추기 답안 객체를 허용한다.
ALTER TABLE quiz_item DROP CONSTRAINT ck_quiz_item_answer;
ALTER TABLE quiz_item ADD CONSTRAINT ck_quiz_item_answer CHECK (
    (interaction_type = 'FLIP_CARD' AND answer IS NULL)
    OR (answer IS NOT NULL AND jsonb_typeof(answer) = 'object')
);
