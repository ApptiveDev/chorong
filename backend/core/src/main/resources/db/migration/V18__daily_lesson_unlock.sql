CREATE TABLE lesson_progress (
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lesson(lesson_id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'UNLOCKED',
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id),
    CONSTRAINT ck_lesson_progress_status CHECK (status IN ('UNLOCKED', 'IN_PROGRESS', 'COMPLETED')),
    CONSTRAINT ck_lesson_progress_completion CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL)
        OR (status <> 'COMPLETED' AND completed_at IS NULL)
    ),
    CONSTRAINT uq_lesson_progress_scope UNIQUE (user_id, course_id, lesson_id)
);
CREATE INDEX ix_lesson_progress_course_status ON lesson_progress(user_id, course_id, status);

CREATE TABLE course_unlock_mutex (
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE course_daily_unlock (
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
    unlock_date DATE NOT NULL,
    lesson_id BIGINT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, course_id, unlock_date),
    CONSTRAINT fk_course_daily_unlock_progress
        FOREIGN KEY (user_id, course_id, lesson_id)
        REFERENCES lesson_progress(user_id, course_id, lesson_id) ON DELETE CASCADE,
    CONSTRAINT uq_course_daily_unlock_lesson UNIQUE (user_id, lesson_id)
);
