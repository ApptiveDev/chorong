-- 하우징 그림(0.4.2). 그림은 미디어 버킷 housing/ 아래 PNG 이고 DB에는 경로만 둔다. 응답은 app.media-base-url 을 붙인 URL 이다.
-- 파일 이름은 {아이템코드}_{색}.png, 색 옵션이 없으면 {아이템코드}.png. width·height 는 1배 기준 픽셀 크기다.
-- item_category 는 방 꾸미기 필터 탭 분류다. FLOOR·WALL 아이템은 NULL.
-- housing_furniture.category(FURNITURE·AVATAR)는 예전부터 있던 다른 용도의 칼럼이다.

ALTER TABLE housing_furniture
    ADD COLUMN image_path VARCHAR(500),
    ADD COLUMN width INT CHECK (width > 0),
    ADD COLUMN height INT CHECK (height > 0),
    ADD COLUMN item_category VARCHAR(20)
        CHECK (item_category IN ('PLANT', 'RUG', 'CHAIR', 'LAMP', 'DESK', 'SHELF', 'BED'));

ALTER TABLE housing_store_item
    ADD COLUMN code VARCHAR(60),
    ADD COLUMN item_category VARCHAR(20)
        CHECK (item_category IN ('PLANT', 'RUG', 'CHAIR', 'LAMP', 'DESK', 'SHELF', 'BED'));
CREATE UNIQUE INDEX uq_housing_store_item_code ON housing_store_item (code) WHERE code IS NOT NULL;

-- 상점 옵션 그림은 기존 preview_asset 경로를 방 그림으로도 쓴다.
ALTER TABLE housing_store_option
    ADD COLUMN width INT CHECK (width > 0),
    ADD COLUMN height INT CHECK (height > 0);
