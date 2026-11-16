-- 복습 후보를 0.4.1 규칙으로 바꾼다.
-- 후보 = 완료한 레슨의 복습 전용 문제 + 완료한 레슨에서 처음 학습할 때 틀린 퀴즈.
-- quiz_review_pool 은 사용자·문제별로 "레슨에서 틀렸는지"와 재출제 제외 기간(available_on 전날까지)만 담는다.

ALTER TABLE quiz_review_pool ADD COLUMN lesson_wrong BOOLEAN NOT NULL DEFAULT FALSE;

-- 레슨 학습(replay=false) 채점에서 틀린 기록이 있으면 표시한다. 복습 문항으로 낸 답안은 제외한다.
UPDATE quiz_review_pool p SET lesson_wrong = EXISTS (
    SELECT 1 FROM quiz_attempt qa
    WHERE qa.user_id = p.user_id AND qa.quiz_id = p.quiz_id
      AND NOT qa.replay AND qa.graded AND qa.correct = FALSE
      AND NOT EXISTS (SELECT 1 FROM review_session_item i WHERE i.attempt_id = qa.attempt_id)
);

-- 정답·오답 구분은 더 쓰지 않는다. 이 열을 쓰던 인덱스도 함께 지워진다.
ALTER TABLE quiz_review_pool DROP COLUMN status;
CREATE INDEX ix_quiz_review_pool_user_available ON quiz_review_pool(user_id, available_on, quiz_id);

-- 회차 문항의 출처. 기존 WRONG·CORRECT 문항은 LEGACY 로 남긴다.
ALTER TABLE review_session_item DROP CONSTRAINT review_session_item_source_status_check;
UPDATE review_session_item SET source_status = 'LEGACY';
ALTER TABLE review_session_item ADD CONSTRAINT ck_review_session_item_source
    CHECK (source_status IN ('REVIEW_ONLY', 'LESSON_WRONG', 'LEGACY'));
ALTER TABLE review_session_item ALTER COLUMN source_status TYPE VARCHAR(12);
