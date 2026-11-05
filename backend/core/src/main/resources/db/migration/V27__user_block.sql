CREATE TABLE user_block (
    block_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    blocked_user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_block_pair UNIQUE (user_id, blocked_user_id),
    CONSTRAINT ck_user_block_not_self CHECK (user_id <> blocked_user_id)
);

CREATE INDEX ix_user_block_reverse ON user_block(blocked_user_id, user_id);
