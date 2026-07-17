-- Une codigo_pais + numero en una sola columna telefono
USE sistema_usuarios;

-- Liberar FK de referencia antes de alterar
UPDATE usuarios SET telefono_id = NULL;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'sistema_usuarios'
    AND TABLE_NAME = 'usuario_telefonos'
    AND COLUMN_NAME = 'telefono'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE usuario_telefonos ADD COLUMN telefono VARCHAR(20) NULL AFTER usuario_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rellenar desde columnas antiguas si existen
SET @has_codigo := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'sistema_usuarios'
    AND TABLE_NAME = 'usuario_telefonos'
    AND COLUMN_NAME = 'codigo_pais'
);

SET @sql := IF(@has_codigo > 0,
  'UPDATE usuario_telefonos SET telefono = CONCAT(''+'', codigo_pais, numero) WHERE telefono IS NULL OR telefono = ''''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Quitar duplicados de telefono dejando el MIN(id)
DELETE t1 FROM usuario_telefonos t1
INNER JOIN usuario_telefonos t2
  ON t1.telefono = t2.telefono AND t1.id > t2.id
WHERE t1.telefono IS NOT NULL AND t1.telefono <> '';

-- Eliminar filas sin teléfono usable
DELETE FROM usuario_telefonos WHERE telefono IS NULL OR TRIM(telefono) = '';

-- Quitar índice único viejo si existe
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'sistema_usuarios'
    AND TABLE_NAME = 'usuario_telefonos'
    AND INDEX_NAME = 'uk_telefono_completo'
);
SET @sql := IF(@idx > 0,
  'ALTER TABLE usuario_telefonos DROP INDEX uk_telefono_completo',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Dropear columnas viejas
SET @sql := IF(@has_codigo > 0,
  'ALTER TABLE usuario_telefonos DROP COLUMN codigo_pais, DROP COLUMN numero',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- NOT NULL + UNIQUE
ALTER TABLE usuario_telefonos
  MODIFY COLUMN telefono VARCHAR(20) NOT NULL;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = 'sistema_usuarios'
    AND TABLE_NAME = 'usuario_telefonos'
    AND INDEX_NAME = 'uk_telefono'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE usuario_telefonos ADD UNIQUE KEY uk_telefono (telefono)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Restaurar telefono_id al primer teléfono de cada usuario
UPDATE usuarios u
LEFT JOIN (
  SELECT usuario_id, MIN(id) AS id FROM usuario_telefonos GROUP BY usuario_id
) t ON t.usuario_id = u.id
SET u.telefono_id = t.id;
