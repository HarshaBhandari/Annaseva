USE annaseva;

ALTER TABLE profiles
  ADD COLUMN aadhaar_address VARCHAR(1000) NULL,
  ADD COLUMN aadhaar_linked_mobile VARCHAR(32) NULL;

ALTER TABLE fps_shops
  ADD COLUMN contact_number VARCHAR(32) NULL;

CREATE TABLE IF NOT EXISTS ration_card_members (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ration_card_id CHAR(36) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_ration_card_members_card (ration_card_id),
  CONSTRAINT fk_ration_card_members_card FOREIGN KEY (ration_card_id)
    REFERENCES ration_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB;
