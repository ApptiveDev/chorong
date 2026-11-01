CREATE TABLE housing_report (
    report_id BIGSERIAL PRIMARY KEY,
    housing_user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    reporter_user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    reason VARCHAR(32) NOT NULL,
    detail VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_housing_report_not_self CHECK (housing_user_id <> reporter_user_id),
    CONSTRAINT ck_housing_report_reason CHECK (reason IN ('INAPPROPRIATE_NAME', 'ABUSE', 'SPAM', 'OTHER')),
    CONSTRAINT ck_housing_report_detail_length CHECK (detail IS NULL OR char_length(detail) <= 255)
);

CREATE INDEX ix_housing_report_target_created ON housing_report(housing_user_id, created_at DESC);
CREATE INDEX ix_housing_report_target_reporter_created ON housing_report(housing_user_id, reporter_user_id, created_at DESC);

CREATE TABLE housing_moderation_hide (
    housing_user_id BIGINT PRIMARY KEY REFERENCES app_user(user_id) ON DELETE CASCADE,
    hidden_until TIMESTAMPTZ NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_housing_moderation_future CHECK (hidden_until > triggered_at)
);

CREATE INDEX ix_housing_moderation_hidden_until ON housing_moderation_hide(hidden_until);
