-- Esquema: teléfono en una sola columna (+50241234567)

CREATE DATABASE IF NOT EXISTS sistema_usuarios
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sistema_usuarios;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  correo_id INT(10) UNSIGNED NULL,
  telefono_id INT(10) UNSIGNED NULL,
  fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at_user_id INT(10) UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_at_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_usuarios_nombre (nombre),
  KEY idx_usuarios_estado (estado),
  KEY idx_usuarios_correo_id (correo_id),
  KEY idx_usuarios_telefono_id (telefono_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_telefonos (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT(10) UNSIGNED NOT NULL,
  telefono VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at_user_id INT(10) UNSIGNED NULL,
  updated_at_user_id INT(10) UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_telefono (telefono),
  KEY idx_telefonos_usuario (usuario_id),
  CONSTRAINT fk_telefonos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

ALTER TABLE usuarios
  ADD CONSTRAINT fk_usuarios_correo
    FOREIGN KEY (correo_id) REFERENCES usuario_correos (id)
    ON DELETE SET NULL,
  ADD CONSTRAINT fk_usuarios_telefono
    FOREIGN KEY (telefono_id) REFERENCES usuario_telefonos (id)
    ON DELETE SET NULL;
