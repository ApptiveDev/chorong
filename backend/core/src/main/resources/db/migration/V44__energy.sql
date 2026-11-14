-- 에너지: 매일 00시(KST)에 5개로 채운다. energy_date 가 오늘(KST)이 아니면 5개로 본다.
ALTER TABLE user_wallet
    ADD COLUMN energy INT NOT NULL DEFAULT 5,
    ADD COLUMN energy_date DATE,
    ADD CONSTRAINT ck_user_wallet_energy CHECK (energy BETWEEN 0 AND 5);

-- 레슨을 시작할 때 에너지를 썼는지. 썼으면 완료 시 별가루를 준다.
ALTER TABLE lesson_progress ADD COLUMN energy_spent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lesson_replay_progress ADD COLUMN energy_spent BOOLEAN NOT NULL DEFAULT FALSE;

-- 배포 전에 시작한 레슨은 에너지를 쓴 것으로 보고 기존처럼 별가루를 준다.
UPDATE lesson_progress SET energy_spent = TRUE WHERE status = 'IN_PROGRESS';
