ALTER TABLE app_user
    ADD COLUMN retention_processed_at TIMESTAMPTZ;

ALTER TABLE housing_report
    ALTER COLUMN reporter_user_id DROP NOT NULL;

CREATE INDEX ix_app_user_retention_due
    ON app_user(deletion_after, user_id)
    WHERE status='WITHDRAWN' AND retention_processed_at IS NULL;
