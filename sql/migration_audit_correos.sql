-- Auditoría + correos + quitar es_principal
USE sistema_usuarios;

-- 1) usuarios: quién creó / modificó
ALTER TABLE usuarios
  ADD COLUMN created_at_user_id INT(10) UNSIGNED NULL AFTER created_at,
  ADD COLUMN updated_at_user_id INT(10) UNSIGNED NULL AFTER updated_at;

-- 2) telefonos: quitar principal, agregar updated_at y auditoría
ALTER TABLE usuario_telefonos
  DROP COLUMN es_principal,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD COLUMN created_at_user_id INT(10) UNSIGNED NULL AFTER updated_at,
  ADD COLUMN updated_at_user_id INT(10) UNSIGNED NULL AFTER created_at_user_id;

-- 3) correos (varios por usuario, sin "principal")
CREATE TABLE IF NOT EXISTS usuario_correos (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT(10) UNSIGNED NOT NULL,
  correo VARCHAR(180) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at_user_id INT(10) UNSIGNED NULL,
  updated_at_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_correo (correo),
  KEY idx_correos_usuario (usuario_id),
  CONSTRAINT fk_correos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrar correos actuales de usuarios
INSERT IGNORE INTO usuario_correos (usuario_id, correo, created_at_user_id, updated_at_user_id)
SELECT u.id, u.correo, u.created_at_user_id, u.updated_at_user_id
FROM usuarios u
WHERE TRIM(u.correo) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM usuario_correos c WHERE c.usuario_id = u.id OR c.correo = u.correo
  );
