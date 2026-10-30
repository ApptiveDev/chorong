CREATE INDEX ix_user_auth_provider_uid_case ON user_auth (provider, upper(provider_uid));

CREATE TABLE auth_guest (
    auth_id BIGINT PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_auth_guest_auth FOREIGN KEY (auth_id) REFERENCES user_auth (auth_id) ON DELETE CASCADE,
    CONSTRAINT ck_auth_guest_platform CHECK (platform IN ('IOS', 'ANDROID'))
);

-- 기존 GUEST는 platform을 알 수 없으므로 임의로 채우지 않는다. v1 요청 시 생성한다.
