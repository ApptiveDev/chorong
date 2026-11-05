ALTER TABLE reward_ledger DROP CONSTRAINT ck_reward_ledger_source;
ALTER TABLE reward_ledger
    ADD CONSTRAINT ck_reward_ledger_source
    CHECK (source_type IN ('LESSON', 'COURSE', 'REVIEW', 'ONBOARDING') AND source_id > 0);
