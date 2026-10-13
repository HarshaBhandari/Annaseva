USE annaseva;

ALTER TABLE profiles
  ADD COLUMN ration_card_number VARCHAR(64) NULL,
  ADD UNIQUE KEY uq_profiles_ration_card_number (ration_card_number);