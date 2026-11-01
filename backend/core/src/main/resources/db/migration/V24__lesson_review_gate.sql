CREATE TABLE lesson_review_gate (
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lesson(lesson_id) ON DELETE CASCADE,
    review_date DATE NOT NULL,
    passed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id, review_date)
);
