USE annaseva;

SET @drop_household_unique_index = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'profiles'
        AND index_name = 'uq_profiles_ration_card_number'
    ),
    'ALTER TABLE profiles DROP INDEX uq_profiles_ration_card_number',
    'SELECT 1'
  )
);
PREPARE household_index_stmt FROM @drop_household_unique_index;
EXECUTE household_index_stmt;
DEALLOCATE PREPARE household_index_stmt;

UPDATE profiles
SET ration_card_number = UPPER(REGEXP_REPLACE(ration_card_number, '[[:space:]-]', ''))
WHERE ration_card_number IS NOT NULL;

SET @add_household_index = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'profiles'
        AND index_name = 'ix_profiles_ration_card_number'
    ),
    'SELECT 1',
    'ALTER TABLE profiles ADD KEY ix_profiles_ration_card_number (ration_card_number)'
  )
);
PREPARE household_index_stmt FROM @add_household_index;
EXECUTE household_index_stmt;
DEALLOCATE PREPARE household_index_stmt;
