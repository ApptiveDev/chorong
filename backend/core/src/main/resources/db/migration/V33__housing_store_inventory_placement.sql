ALTER TABLE housing_coordinate_placement
    ADD CONSTRAINT fk_housing_coordinate_placement_store_inventory
        FOREIGN KEY (store_inventory_id) REFERENCES housing_store_owned_option(inventory_id) ON DELETE CASCADE;
