ALTER TABLE quiz_attempt ADD COLUMN replay BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE quiz_review_pool (
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    quiz_id BIGINT NOT NULL REFERENCES quiz_item(quiz_id) ON DELETE CASCADE,
    status VARCHAR(10) NOT NULL,
    available_on DATE NOT NULL,
    last_submitted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, quiz_id),
    CONSTRAINT ck_quiz_review_pool_status CHECK (status IN ('WRONG', 'CORRECT'))
);
CREATE INDEX ix_quiz_review_pool_user_status_date ON quiz_review_pool(user_id, status, available_on, quiz_id);
