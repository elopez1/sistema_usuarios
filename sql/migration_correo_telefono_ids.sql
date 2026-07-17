-- Migración: usuarios.correo/telefono (texto) → correo_id/telefono_id
USE sistema_usuarios;

-- 1) Agregar columnas de ID (si no existen)
SET @col_correo_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'correo_id'
);
SET @sql := IF(@col_correo_id = 0,
  'ALTER TABLE usuarios ADD COLUMN correo_id INT(10) UNSIGNED NULL AFTER nombre',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_tel_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'telefono_id'
);
SET @sql := IF(@col_tel_id = 0,
  'ALTER TABLE usuarios ADD COLUMN telefono_id INT(10) UNSIGNED NULL AFTER correo_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Rellenar IDs desde el primer correo/teléfono de cada usuario
UPDATE usuarios u
LEFT JOIN (
  SELECT usuario_id, MIN(id) AS id FROM usuario_correos GROUP BY usuario_id
) c ON c.usuario_id = u.id
SET u.correo_id = c.id
WHERE u.correo_id IS NULL;

UPDATE usuarios u
LEFT JOIN (
  SELECT usuario_id, MIN(id) AS id FROM usuario_telefonos GROUP BY usuario_id
) t ON t.usuario_id = u.id
SET u.telefono_id = t.id
WHERE u.telefono_id IS NULL;

-- 3) Quitar UNIQUE antiguo sobre correo texto (si existe)
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'uk_usuarios_correo'
);
SET @sql := IF(@idx > 0, 'ALTER TABLE usuarios DROP INDEX uk_usuarios_correo', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Eliminar columnas de texto denormalizadas (si existen)
SET @col_correo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'correo'
);
SET @sql := IF(@col_correo > 0, 'ALTER TABLE usuarios DROP COLUMN correo', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_tel := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'telefono'
);
SET @sql := IF(@col_tel > 0, 'ALTER TABLE usuarios DROP COLUMN telefono', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) Índices
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'idx_usuarios_correo_id'
);
SET @sql := IF(@idx = 0, 'ALTER TABLE usuarios ADD KEY idx_usuarios_correo_id (correo_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'idx_usuarios_telefono_id'
);
SET @sql := IF(@idx = 0, 'ALTER TABLE usuarios ADD KEY idx_usuarios_telefono_id (telefono_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6) FKs (ignorar si ya existen)
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'fk_usuarios_correo'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_correo FOREIGN KEY (correo_id) REFERENCES usuario_correos (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'sistema_usuarios' AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'fk_usuarios_telefono'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_telefono FOREIGN KEY (telefono_id) REFERENCES usuario_telefonos (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
