CREATE DATABASE IF NOT EXISTS annaseva
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE annaseva;

CREATE TABLE IF NOT EXISTS app_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email_verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_app_sessions_expiry (expires_at),
  CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role ENUM('beneficiary', 'shopkeeper', 'admin') NOT NULL,
  UNIQUE KEY uq_user_roles_user_role (user_id, role),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  mobile_number VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_user FOREIGN KEY (id)
    REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS fps_shops (
  id CHAR(36) NOT NULL PRIMARY KEY,
  shop_code VARCHAR(64) NOT NULL UNIQUE,
  shop_name VARCHAR(255) NOT NULL,
  address VARCHAR(500) NOT NULL,
  district VARCHAR(120) NOT NULL,
  taluka VARCHAR(120) NOT NULL,
  operating_hours VARCHAR(255) NOT NULL DEFAULT '9:00 AM - 6:00 PM',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ration_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  item_code VARCHAR(64) NOT NULL UNIQUE,
  item_name VARCHAR(255) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  description VARCHAR(500) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS entitlement_rules (
  id CHAR(36) NOT NULL PRIMARY KEY,
  scheme_name VARCHAR(255) NOT NULL,
  card_category VARCHAR(32) NOT NULL,
  item_id CHAR(36) NOT NULL,
  quantity_per_person DECIMAL(10,2) NOT NULL,
  effective_from DATE NOT NULL DEFAULT (CURRENT_DATE),
  effective_to DATE NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_entitlement_category_item_start (card_category, item_id, effective_from),
  CONSTRAINT fk_entitlement_item FOREIGN KEY (item_id)
    REFERENCES ration_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ration_cards (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NULL,
  masked_card_number VARCHAR(64) NOT NULL UNIQUE,
  card_category VARCHAR(32) NOT NULL,
  aadhaar_last4 CHAR(4) NULL,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_ration_cards_user_id (user_id),
  CONSTRAINT fk_ration_cards_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE ration_cards
  MODIFY verification_status VARCHAR(32) NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS beneficiary_profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  ration_card_id CHAR(36) NULL,
  fps_id CHAR(36) NULL,
  family_size INT NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_beneficiary_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_beneficiary_card FOREIGN KEY (ration_card_id)
    REFERENCES ration_cards(id) ON DELETE SET NULL,
  CONSTRAINT fk_beneficiary_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id) ON DELETE SET NULL,
  CONSTRAINT chk_beneficiary_family_size CHECK (family_size BETWEEN 1 AND 20)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shopkeepers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  fps_id CHAR(36) NULL,
  CONSTRAINT fk_shopkeepers_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_shopkeepers_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fps_stock (
  id CHAR(36) NOT NULL PRIMARY KEY,
  fps_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  opening_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
  received_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
  distributed_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
  adjustment_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  wastage_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  closing_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
  minimum_threshold DECIMAL(10,2) NOT NULL DEFAULT 50,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fps_stock_shop_item (fps_id, item_id),
  CONSTRAINT fk_fps_stock_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id) ON DELETE CASCADE,
  CONSTRAINT fk_fps_stock_item FOREIGN KEY (item_id)
    REFERENCES ration_items(id)
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

CREATE TABLE IF NOT EXISTS bookings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  booking_code VARCHAR(64) NOT NULL UNIQUE,
  beneficiary_id CHAR(36) NOT NULL,
  fps_id CHAR(36) NOT NULL,
  booking_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  collection_date DATE NOT NULL,
  collection_slot VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_bookings_beneficiary (beneficiary_id),
  KEY ix_bookings_shop (fps_id),
  CONSTRAINT fk_bookings_beneficiary FOREIGN KEY (beneficiary_id)
    REFERENCES beneficiary_profiles(id),
  CONSTRAINT fk_bookings_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  requested_quantity DECIMAL(10,2) NOT NULL,
  approved_quantity DECIMAL(10,2) NULL,
  CONSTRAINT fk_booking_items_booking FOREIGN KEY (booking_id)
    REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_items_item FOREIGN KEY (item_id)
    REFERENCES ration_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS distribution_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  distribution_code VARCHAR(64) NOT NULL UNIQUE,
  booking_id CHAR(36) NOT NULL UNIQUE,
  beneficiary_id CHAR(36) NOT NULL,
  fps_id CHAR(36) NOT NULL,
  distribution_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  distributed_by CHAR(36) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_distribution_booking FOREIGN KEY (booking_id)
    REFERENCES bookings(id),
  CONSTRAINT fk_distribution_beneficiary FOREIGN KEY (beneficiary_id)
    REFERENCES beneficiary_profiles(id),
  CONSTRAINT fk_distribution_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id),
  CONSTRAINT fk_distribution_user FOREIGN KEY (distributed_by)
    REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS distribution_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  distribution_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  quantity_distributed DECIMAL(10,2) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  CONSTRAINT fk_distribution_items_record FOREIGN KEY (distribution_id)
    REFERENCES distribution_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_distribution_items_item FOREIGN KEY (item_id)
    REFERENCES ration_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(64) NOT NULL DEFAULT 'general',
  read_status BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_notifications_user_created (user_id, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS complaints (
  id CHAR(36) NOT NULL PRIMARY KEY,
  beneficiary_id CHAR(36) NOT NULL,
  fps_id CHAR(36) NULL,
  category VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  resolution_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_complaints_beneficiary FOREIGN KEY (beneficiary_id)
    REFERENCES beneficiary_profiles(id),
  CONSTRAINT fk_complaints_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_predictions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  fps_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  forecast_month VARCHAR(32) NOT NULL,
  predicted_quantity DECIMAL(10,2) NOT NULL,
  lower_bound DECIMAL(10,2) NULL,
  upper_bound DECIMAL(10,2) NULL,
  model_version VARCHAR(64) NOT NULL DEFAULT 'demo-v1',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prediction_shop_item_month_model (fps_id, item_id, forecast_month, model_version),
  CONSTRAINT fk_predictions_shop FOREIGN KEY (fps_id)
    REFERENCES fps_shops(id) ON DELETE CASCADE,
  CONSTRAINT fk_predictions_item FOREIGN KEY (item_id)
    REFERENCES ration_items(id)
) ENGINE=InnoDB;

-- Synthetic demo shops. These rows are inserted only once per shop_code.
INSERT IGNORE INTO fps_shops
  (id, shop_code, shop_name, address, district, taluka, operating_hours)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'FPS-1001', 'Shree Ganesh Fair Price Shop', 'Shop 4, Market Yard Road', 'Pune', 'Haveli', '9:00 AM - 1:00 PM, 3:00 PM - 7:00 PM'),
  ('10000000-0000-4000-8000-000000000002', 'FPS-1002', 'Annapurna Ration Kendra', 'Near Bus Stand, Main Road', 'Nashik', 'Nashik', '8:30 AM - 6:30 PM'),
  ('10000000-0000-4000-8000-000000000003', 'FPS-1003', 'Jyotiba Seva Kendra', 'Station Road, Ward 3', 'Kolhapur', 'Karvir', '9:00 AM - 6:00 PM');

-- Synthetic demo items. These rows are inserted only once per item_code.
INSERT IGNORE INTO ration_items (id, item_code, item_name, unit, description)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'RICE', 'Rice', 'kg', 'Medium grain rice'),
  ('20000000-0000-4000-8000-000000000002', 'WHEAT', 'Wheat', 'kg', 'Whole wheat grain'),
  ('20000000-0000-4000-8000-000000000003', 'SUGAR', 'Sugar', 'kg', 'Refined sugar'),
  ('20000000-0000-4000-8000-000000000004', 'DAL', 'Tur Dal', 'kg', 'Pigeon pea lentils'),
  ('20000000-0000-4000-8000-000000000005', 'OIL', 'Cooking Oil', 'litre', 'Refined sunflower oil'),
  ('20000000-0000-4000-8000-000000000006', 'KERO', 'Kerosene', 'litre', 'For eligible card holders');

-- Demo monthly entitlements for each card category and ration item.
INSERT INTO entitlement_rules
  (id, scheme_name, card_category, item_id, quantity_per_person)
SELECT
  UUID(),
  CASE category.card_category
    WHEN 'Yellow' THEN 'Antyodaya Anna Yojana'
    WHEN 'Orange' THEN 'Priority Household'
    ELSE 'Annapurna Scheme'
  END,
  category.card_category,
  item.id,
  CASE category.card_category
    WHEN 'Yellow' THEN CASE item.item_code
      WHEN 'RICE' THEN 5 WHEN 'WHEAT' THEN 3 WHEN 'SUGAR' THEN 1
      WHEN 'DAL' THEN 1 WHEN 'OIL' THEN 0.5 WHEN 'KERO' THEN 1 END
    WHEN 'Orange' THEN CASE item.item_code
      WHEN 'RICE' THEN 3 WHEN 'WHEAT' THEN 2 WHEN 'SUGAR' THEN 0.5
      WHEN 'DAL' THEN 0.5 WHEN 'OIL' THEN 0.5 WHEN 'KERO' THEN 0 END
    ELSE CASE item.item_code
      WHEN 'RICE' THEN 2 WHEN 'WHEAT' THEN 1 WHEN 'SUGAR' THEN 0.5
      WHEN 'DAL' THEN 0 WHEN 'OIL' THEN 0.5 WHEN 'KERO' THEN 0 END
  END
FROM (SELECT 'Yellow' AS card_category UNION ALL SELECT 'Orange' UNION ALL SELECT 'White') AS category
CROSS JOIN ration_items AS item
WHERE TRUE
ON DUPLICATE KEY UPDATE
  scheme_name = VALUES(scheme_name),
  quantity_per_person = VALUES(quantity_per_person),
  active = TRUE;

-- Demo starting stock at each shop for every ration item.
INSERT INTO fps_stock
  (id, fps_id, item_id, opening_stock, received_stock, closing_stock, minimum_threshold)
SELECT UUID(), shop.id, item.id, 500, 200, 650, 100
FROM fps_shops AS shop
CROSS JOIN ration_items AS item
WHERE TRUE
ON DUPLICATE KEY UPDATE
  opening_stock = VALUES(opening_stock),
  received_stock = VALUES(received_stock),
  closing_stock = VALUES(closing_stock),
  minimum_threshold = VALUES(minimum_threshold);

UPDATE fps_stock AS stock
JOIN fps_shops AS shop ON shop.id = stock.fps_id AND shop.shop_code = 'FPS-1002'
JOIN ration_items AS item ON item.id = stock.item_id AND item.item_code = 'SUGAR'
SET stock.closing_stock = 40, stock.minimum_threshold = 60;

-- Demo forecast rows for the next calendar month.
INSERT IGNORE INTO ai_predictions
  (id, fps_id, item_id, forecast_month, predicted_quantity, lower_bound, upper_bound)
SELECT
  UUID(), shop.id, item.id,
  DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH), '%M %Y'),
  700 + FLOOR(RAND() * 201), 620, 820
FROM fps_shops AS shop
CROSS JOIN ration_items AS item
WHERE item.item_code IN ('RICE', 'WHEAT', 'SUGAR');

-- Verification: expected seeded counts are 3 shops, 6 items, 18 entitlement
-- rules, 18 stock rows, and 9 forecast rows.
SELECT 'fps_shops' AS table_name, COUNT(*) AS row_count FROM fps_shops
UNION ALL SELECT 'ration_items', COUNT(*) FROM ration_items
UNION ALL SELECT 'entitlement_rules', COUNT(*) FROM entitlement_rules
UNION ALL SELECT 'fps_stock', COUNT(*) FROM fps_stock
UNION ALL SELECT 'ai_predictions', COUNT(*) FROM ai_predictions;