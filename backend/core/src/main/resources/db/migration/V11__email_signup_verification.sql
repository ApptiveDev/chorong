CREATE TABLE email_signup_verification (
    verification_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(160) NOT NULL,
    code_hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    invalidated_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0)
);

CREATE INDEX ix_email_signup_verification_email_created
    ON email_signup_verification (email, created_at DESC);
CREATE INDEX ix_email_signup_verification_user ON email_signup_verification (user_id);
