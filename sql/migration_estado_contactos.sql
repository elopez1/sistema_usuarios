-- Agrega estado (activo/inactivo) a correos y teléfonos (baja lógica)
USE sistema_usuarios;

ALTER TABLE usuario_correos
  ADD COLUMN estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo'
    AFTER correo,
  ADD KEY idx_correos_estado (estado);

ALTER TABLE usuario_telefonos
  ADD COLUMN estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo'
    AFTER telefono,
  ADD KEY idx_telefonos_estado (estado);
