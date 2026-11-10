-- 퀴즈 유형을 학습 콘텐츠 시뮬레이터의 7가지로 바꾼다. 기존 형식의 퀴즈와 풀이 기록은 지운다.
-- 복습 풀·복습 세션 문항은 ON DELETE CASCADE, 레슨 진행의 last_content_id 는 ON DELETE SET NULL 로 함께 정리된다.
DELETE FROM review_session WHERE status = 'OPEN';
DELETE FROM quiz_attempt;
DELETE FROM lesson_content WHERE quiz_id IS NOT NULL;
DELETE FROM quiz_item;

ALTER TABLE quiz_item DROP CONSTRAINT ck_quiz_item_interaction_type;
ALTER TABLE quiz_item ADD CONSTRAINT ck_quiz_item_interaction_type CHECK (
    interaction_type IN ('OX', 'SINGLE', 'MULTI', 'BLANK', 'SLIDER', 'MATCH', 'CHOSUNG')
);

-- MATCH 는 짝을 config 에 공개하므로 저장 정답이 없다.
ALTER TABLE quiz_item DROP CONSTRAINT ck_quiz_item_answer;
ALTER TABLE quiz_item ADD CONSTRAINT ck_quiz_item_answer CHECK (
    (interaction_type = 'MATCH' AND answer IS NULL)
    OR (interaction_type <> 'MATCH' AND answer IS NOT NULL AND jsonb_typeof(answer) = 'object')
);

-- 해설이 없는 문항은 레슨 도입 질문이며 점수와 복습에 넣지 않는다.
ALTER TABLE quiz_item ALTER COLUMN explanation DROP NOT NULL;
ALTER TABLE quiz_item ADD COLUMN source TEXT;
