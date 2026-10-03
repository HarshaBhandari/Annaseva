USE annaseva;

ALTER TABLE ration_cards
  MODIFY verification_status VARCHAR(32) NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS mobile_otp_challenges (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  mobile_number VARCHAR(32) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_mobile_otp_user_created (user_id, created_at),
  CONSTRAINT fk_mobile_otp_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_verifications (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  phone_verified_at DATETIME NULL,
  aadhaar_last4 CHAR(4) NULL,
  identity_status ENUM('not_submitted', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'not_submitted',
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  reviewed_by CHAR(36) NULL,
  review_note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_verifications_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_verifications_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_refill_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  shopkeeper_user_id CHAR(36) NOT NULL,
  fps_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  request_note VARCHAR(500) NULL,
  review_note VARCHAR(1000) NULL,
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_refill_status_created (status, created_at),
  CONSTRAINT fk_refill_shopkeeper FOREIGN KEY (shopkeeper_user_id)
    REFERENCES app_users(id),
  CONSTRAINT fk_refill_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id),
  CONSTRAINT fk_refill_item FOREIGN KEY (item_id)
    REFERENCES ration_items(id),
  CONSTRAINT fk_refill_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO user_verifications (user_id, aadhaar_last4, identity_status, submitted_at)
SELECT bp.user_id, rc.aadhaar_last4, 'pending', NOW()
FROM beneficiary_profiles bp
JOIN ration_cards rc ON rc.id = bp.ration_card_id;

UPDATE ration_cards rc
LEFT JOIN beneficiary_profiles bp ON bp.ration_card_id = rc.id
LEFT JOIN user_verifications uv ON uv.user_id = COALESCE(rc.user_id, bp.user_id)
SET rc.verification_status = CASE
  WHEN uv.identity_status = 'verified' THEN 'verified'
  WHEN uv.identity_status = 'rejected' THEN 'rejected'
  ELSE 'pending'
END;