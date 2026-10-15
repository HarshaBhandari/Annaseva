USE annaseva;

SET @add_selected_fps_column = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE beneficiary_profiles ADD COLUMN selected_fps_id CHAR(36) NULL AFTER fps_id',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'beneficiary_profiles'
    AND COLUMN_NAME = 'selected_fps_id'
);
PREPARE add_selected_fps_statement FROM @add_selected_fps_column;
EXECUTE add_selected_fps_statement;
DEALLOCATE PREPARE add_selected_fps_statement;

SET @add_selected_fps_foreign_key = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE beneficiary_profiles ADD CONSTRAINT fk_beneficiary_selected_shop FOREIGN KEY (selected_fps_id) REFERENCES fps_shops(id) ON DELETE SET NULL',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'beneficiary_profiles'
    AND CONSTRAINT_NAME = 'fk_beneficiary_selected_shop'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
PREPARE add_selected_fps_fk_statement FROM @add_selected_fps_foreign_key;
EXECUTE add_selected_fps_fk_statement;
DEALLOCATE PREPARE add_selected_fps_fk_statement;

UPDATE beneficiary_profiles
SET selected_fps_id = fps_id
WHERE selected_fps_id IS NULL
  AND fps_id IS NOT NULL;

UPDATE beneficiary_profiles
SET fps_id = selected_fps_id
WHERE selected_fps_id IS NOT NULL
  AND (fps_id IS NULL OR fps_id <> selected_fps_id);
