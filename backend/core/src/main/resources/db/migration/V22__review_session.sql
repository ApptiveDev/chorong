CREATE TABLE review_session (
    review_session_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    lesson_id BIGINT REFERENCES lesson(lesson_id) ON DELETE SET NULL,
    review_date DATE NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_review_session_status CHECK (status IN ('OPEN', 'COMPLETED')),
    CONSTRAINT ck_review_session_completion CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_review_session_open_scope ON review_session(user_id, review_date, COALESCE(lesson_id, 0)) WHERE status = 'OPEN';
CREATE TABLE review_session_item (
    review_item_id BIGSERIAL PRIMARY KEY,
    review_session_id BIGINT NOT NULL REFERENCES review_session(review_session_id) ON DELETE CASCADE,
    quiz_id BIGINT NOT NULL REFERENCES quiz_item(quiz_id) ON DELETE CASCADE,
    item_order SMALLINT NOT NULL CHECK (item_order BETWEEN 0 AND 4),
    source_status VARCHAR(10) NOT NULL CHECK (source_status IN ('WRONG', 'CORRECT')),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    correct BOOLEAN,
    answered_at TIMESTAMPTZ,
    attempt_id BIGINT,
    CONSTRAINT uq_review_session_quiz UNIQUE (review_session_id, quiz_id),
    CONSTRAINT uq_review_session_order UNIQUE (review_session_id, item_order),
    CONSTRAINT ck_review_session_item_answer CHECK ((completed = FALSE AND correct IS NULL AND answered_at IS NULL AND attempt_id IS NULL) OR (completed = TRUE AND correct IS NOT NULL AND answered_at IS NOT NULL AND attempt_id IS NOT NULL))
);
CREATE INDEX ix_review_session_user_date ON review_session(user_id, review_date DESC, review_session_id DESC);
