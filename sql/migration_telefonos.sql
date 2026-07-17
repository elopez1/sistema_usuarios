-- Migración compatible con MySQL 5.7 (solo tabla teléfonos)
USE sistema_usuarios;

CREATE TABLE IF NOT EXISTS usuario_telefonos (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT(10) UNSIGNED NOT NULL,
  codigo_pais VARCHAR(3) NOT NULL,
  numero VARCHAR(15) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at_user_id INT(10) UNSIGNED NULL,
  updated_at_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_telefono_completo (codigo_pais, numero),
  KEY idx_telefonos_usuario (usuario_id),
  CONSTRAINT fk_telefonos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
