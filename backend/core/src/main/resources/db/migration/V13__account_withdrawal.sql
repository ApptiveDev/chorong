ALTER TABLE app_user
    ADD COLUMN withdrawal_reason VARCHAR(255),
    ADD COLUMN deletion_after TIMESTAMPTZ;

UPDATE app_user
SET deletion_after = withdrawn_at + INTERVAL '90 days'
WHERE status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL;

ALTER TABLE housing_profile
    ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
