-- 앱 내 알림함. 지금은 우주선 좋아요(HOUSING_LIKE)만 쌓는다.
-- 같은 사람이 같은 종류로 보내는 알림은 한 번만 만든다. 좋아요를 취소해도 지우지 않는다.
CREATE TABLE user_notification (
    notification_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    actor_user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_notification UNIQUE (user_id, type, actor_user_id),
    CONSTRAINT ck_user_notification_type CHECK (type IN ('HOUSING_LIKE')),
    CONSTRAINT ck_user_notification_not_self CHECK (user_id <> actor_user_id)
);

CREATE INDEX ix_user_notification_list ON user_notification(user_id, created_at DESC, notification_id DESC);
CREATE INDEX ix_user_notification_actor ON user_notification(actor_user_id);
