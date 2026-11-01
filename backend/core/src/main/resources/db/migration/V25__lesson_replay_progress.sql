CREATE TABLE lesson_replay_progress (
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lesson(lesson_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    last_content_id BIGINT REFERENCES lesson_content(content_id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, lesson_id),
    CONSTRAINT ck_lesson_replay_completion CHECK (completed_at IS NULL OR completed_at >= started_at)
);
