-- app_user: 기기 UUID 를 인증 수단 테이블로 옮기고 계정 정보만 남긴다
ALTER TABLE app_user
    ADD COLUMN status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN nickname     VARCHAR(40),
    ADD COLUMN email        VARCHAR(255),
    ADD COLUMN withdrawn_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_app_user_status CHECK (status IN ('ACTIVE', 'WITHDRAWN'));

-- 인증 수단. 유저 1 : N. 비회원(GUEST)도 한 행으로 취급한다
CREATE TABLE user_auth (
    auth_id       BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    provider      VARCHAR(20) NOT NULL,
    provider_uid  VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_auth_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT uq_user_auth_provider_uid UNIQUE (provider, provider_uid),
    CONSTRAINT ck_user_auth_provider CHECK (provider IN ('KAKAO', 'APPLE', 'GOOGLE', 'NAVER', 'PASSWORD', 'GUEST'))
);
CREATE INDEX ix_user_auth_user ON user_auth (user_id);

-- PASSWORD 전용
CREATE TABLE user_password (
    auth_id              BIGINT PRIMARY KEY,
    password_hash        VARCHAR(100) NOT NULL,
    password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    failed_count         INT NOT NULL DEFAULT 0,
    locked_until         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_password_auth FOREIGN KEY (auth_id) REFERENCES user_auth (auth_id) ON DELETE CASCADE
);

-- 소셜(KAKAO/APPLE/GOOGLE/NAVER) 전용
CREATE TABLE user_oauth (
    auth_id         BIGINT PRIMARY KEY,
    email           VARCHAR(255),
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    display_name    VARCHAR(80),
    profile_json    JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_oauth_auth FOREIGN KEY (auth_id) REFERENCES user_auth (auth_id) ON DELETE CASCADE
);

-- 리프레시 토큰. 원문은 저장하지 않고 SHA-256 해시만 둔다
CREATE TABLE user_refresh_token (
    token_id     BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    token_hash   VARCHAR(64) NOT NULL,
    device_uuid  VARCHAR(36),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_user_refresh_token_user FOREIGN KEY (user_id) REFERENCES app_user (user_id),
    CONSTRAINT uq_user_refresh_token_hash UNIQUE (token_hash)
);
CREATE INDEX ix_user_refresh_token_user ON user_refresh_token (user_id);

-- 기존 기기 유저를 GUEST 인증 수단으로 이관
INSERT INTO user_auth (user_id, provider, provider_uid, created_at, modified_at)
SELECT user_id, 'GUEST', device_uuid, created_at, modified_at FROM app_user;

ALTER TABLE app_user DROP CONSTRAINT uq_app_user_device_uuid;
ALTER TABLE app_user DROP COLUMN device_uuid;
