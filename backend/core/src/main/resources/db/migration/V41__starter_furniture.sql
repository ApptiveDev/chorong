INSERT INTO housing_furniture(code,name,category,is_default,is_active)
VALUES ('starter_cat','고양이','AVATAR',FALSE,TRUE),
       ('starter_desk','책상','FURNITURE',FALSE,TRUE),
       ('starter_chair','의자','FURNITURE',FALSE,TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO housing_owned_item(user_id,item_type,item_id,acquired_via)
SELECT u.user_id,'FURNITURE',f.furniture_id,'STARTER'
FROM app_user u
CROSS JOIN housing_furniture f
WHERE u.status <> 'WITHDRAWN' AND f.code IN ('starter_cat','starter_desk','starter_chair')
  AND NOT EXISTS (SELECT 1 FROM housing_owned_item o
                  WHERE o.user_id=u.user_id AND o.item_type='FURNITURE' AND o.item_id=f.furniture_id);
