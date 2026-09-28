CREATE TABLE quiz_item (
    quiz_id          BIGSERIAL PRIMARY KEY,
    lesson_id        BIGINT NOT NULL,
    question         TEXT NOT NULL,
    instruction      TEXT NOT NULL,
    interaction_type VARCHAR(30) NOT NULL,
    config           JSONB NOT NULL,
    answer           JSONB,
    explanation      TEXT NOT NULL,
    difficulty       VARCHAR(30) NOT NULL,
    quiz_order       INT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_quiz_item_lesson_id CHECK (lesson_id > 0),
    CONSTRAINT ck_quiz_item_order CHECK (quiz_order >= 0),
    CONSTRAINT ck_quiz_item_difficulty CHECK (btrim(difficulty) <> ''),
    CONSTRAINT ck_quiz_item_interaction_type CHECK (
        interaction_type IN ('SLIDER', 'SWIPE', 'TAP', 'DRAG_DROP', 'SORT', 'MATCHING', 'FLIP_CARD', 'MULTIPLE_CHOICE')
    ),
    CONSTRAINT ck_quiz_item_config CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT ck_quiz_item_answer CHECK (
        (interaction_type = 'FLIP_CARD' AND answer IS NULL)
        OR (interaction_type <> 'FLIP_CARD' AND answer IS NOT NULL AND jsonb_typeof(answer) = 'object')
    )
);
CREATE INDEX ix_quiz_item_lesson_order ON quiz_item (lesson_id, quiz_order, quiz_id);

CREATE TABLE quiz_attempt (
    attempt_id   BIGSERIAL PRIMARY KEY,
    quiz_id      BIGINT NOT NULL,
    user_id      BIGINT NOT NULL,
    response     JSONB NOT NULL,
    graded       BOOLEAN NOT NULL,
    correct      BOOLEAN,
    completed    BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_quiz_attempt_quiz FOREIGN KEY (quiz_id) REFERENCES quiz_item (quiz_id),
    CONSTRAINT fk_quiz_attempt_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT ck_quiz_attempt_response CHECK (jsonb_typeof(response) = 'object'),
    CONSTRAINT ck_quiz_attempt_result CHECK (
        (graded AND correct IS NOT NULL) OR (NOT graded AND correct IS NULL)
    )
);
CREATE INDEX ix_quiz_attempt_user_submitted ON quiz_attempt (user_id, submitted_at, attempt_id);
CREATE INDEX ix_quiz_attempt_quiz ON quiz_attempt (quiz_id);
