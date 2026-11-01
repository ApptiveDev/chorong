CREATE TABLE reward_ledger (
    reward_ledger_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
    source_type VARCHAR(20) NOT NULL,
    source_id BIGINT NOT NULL,
    source_key VARCHAR(160) NOT NULL,
    reward_type VARCHAR(20) NOT NULL,
    currency VARCHAR(20),
    amount BIGINT,
    item_id BIGINT,
    constellation_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_reward_ledger_source CHECK (source_type IN ('LESSON','COURSE') AND source_id > 0),
    CONSTRAINT ck_reward_ledger_type CHECK (reward_type IN ('WALLET','UNLOCK','INVENTORY','CONSTELLATION')),
    CONSTRAINT ck_reward_ledger_wallet CHECK (
        (reward_type = 'WALLET' AND currency IN ('STAR','STARDUST') AND amount > 0 AND item_id IS NULL AND constellation_id IS NULL)
        OR (reward_type = 'CONSTELLATION' AND currency IS NULL AND amount IS NULL AND item_id IS NULL AND constellation_id IS NOT NULL)
    ),
    CONSTRAINT uq_reward_ledger_source UNIQUE (user_id, source_key)
);
CREATE INDEX ix_reward_ledger_history ON reward_ledger(user_id, created_at DESC, reward_ledger_id DESC);
