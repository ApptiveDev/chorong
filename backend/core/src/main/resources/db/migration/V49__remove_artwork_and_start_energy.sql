-- 레슨 완료 그림 보상(ARTWORK)을 없앤다(0.4.1). 에너지는 레슨 시작이 아니라 보상을 받는 완료 때 쓴다.

-- 사용자가 받은 그림이나 그림이 걸린 레슨이 있으면 지우기 전에 처리 방법을 정하도록 멈춘다.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM learning_artwork)
        OR EXISTS (SELECT 1 FROM reward_ledger WHERE reward_type = 'ARTWORK')
        OR EXISTS (SELECT 1 FROM lesson WHERE artwork_image_url IS NOT NULL) THEN
        RAISE EXCEPTION 'Artwork data exists (learning_artwork, ARTWORK rewards or lesson.artwork_image_url). Decide how to migrate it before applying V49.';
    END IF;
END $$;

DROP INDEX uq_reward_ledger_artwork;
ALTER TABLE reward_ledger DROP CONSTRAINT ck_reward_ledger_type;
ALTER TABLE reward_ledger DROP CONSTRAINT ck_reward_ledger_wallet;
ALTER TABLE reward_ledger DROP COLUMN artwork_id;
ALTER TABLE reward_ledger ADD CONSTRAINT ck_reward_ledger_type
    CHECK (reward_type IN ('WALLET', 'UNLOCK', 'INVENTORY', 'CONSTELLATION'));
ALTER TABLE reward_ledger ADD CONSTRAINT ck_reward_ledger_wallet CHECK (
    (reward_type = 'WALLET' AND currency IN ('STAR', 'STARDUST') AND amount > 0 AND item_id IS NULL AND constellation_id IS NULL)
    OR (reward_type = 'CONSTELLATION' AND currency IS NULL AND amount IS NULL AND item_id IS NULL AND constellation_id IS NOT NULL)
);
DROP TABLE learning_artwork;
ALTER TABLE lesson DROP COLUMN artwork_image_url;

-- 시작 때 에너지를 썼는지 기록하던 열. 이제 보상 지급 여부(reward_ledger)로만 판단한다.
ALTER TABLE lesson_progress DROP COLUMN energy_spent;
ALTER TABLE lesson_replay_progress DROP COLUMN energy_spent;
