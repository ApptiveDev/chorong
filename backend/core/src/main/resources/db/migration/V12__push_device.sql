CREATE TABLE push_device (
    device_uuid VARCHAR(36) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    platform VARCHAR(16) NOT NULL,
    push_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_push_device_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT ck_push_device_platform CHECK (platform IN ('IOS', 'ANDROID'))
);

CREATE INDEX ix_push_device_user ON push_device (user_id);
