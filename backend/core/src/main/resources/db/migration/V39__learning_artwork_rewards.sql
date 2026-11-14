ALTER TABLE reward_ledger ADD COLUMN artwork_id BIGINT REFERENCES learning_artwork(artwork_id);
ALTER TABLE reward_ledger ADD COLUMN badge_type VARCHAR(20);
UPDATE reward_ledger SET badge_type = 'CONSTELLATION' WHERE reward_type = 'CONSTELLATION';
ALTER TABLE reward_ledger ADD CONSTRAINT ck_reward_ledger_badge_type CHECK (
    (reward_type = 'CONSTELLATION' AND badge_type IN ('STAR', 'CONSTELLATION'))
    OR (reward_type <> 'CONSTELLATION' AND badge_type IS NULL)
);
ALTER TABLE reward_ledger DROP CONSTRAINT ck_reward_ledger_type;
ALTER TABLE reward_ledger DROP CONSTRAINT ck_reward_ledger_wallet;
ALTER TABLE reward_ledger ADD CONSTRAINT ck_reward_ledger_type
    CHECK (reward_type IN ('WALLET', 'UNLOCK', 'INVENTORY', 'CONSTELLATION', 'ARTWORK'));
ALTER TABLE reward_ledger ADD CONSTRAINT ck_reward_ledger_wallet CHECK (
    (reward_type = 'WALLET' AND currency IN ('STAR', 'STARDUST') AND amount > 0 AND item_id IS NULL AND constellation_id IS NULL AND artwork_id IS NULL)
    OR (reward_type = 'CONSTELLATION' AND currency IS NULL AND amount IS NULL AND item_id IS NULL AND constellation_id IS NOT NULL AND artwork_id IS NULL)
    OR (reward_type = 'ARTWORK' AND currency IS NULL AND amount IS NULL AND item_id IS NULL AND constellation_id IS NULL AND artwork_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_reward_ledger_artwork ON reward_ledger(artwork_id) WHERE artwork_id IS NOT NULL;
