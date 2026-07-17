# Sistema de Gestión de Usuarios

Mini sistema interno para administrar usuarios de una plataforma.

**Stack:** Next.js (App Router) + TypeScript + MySQL (`mysql2`, sin ORM).

## Requisitos

- Node.js 20+
- MySQL en ejecución (por ejemplo MAMP / TablePlus en el puerto `8889`)

## 1. Base de datos

```bash
mysql -h 127.0.0.1 -P 8889 -u root < sql/schema.sql

# Si usas MAMP:
# /Applications/MAMP/Library/bin/mysql -h 127.0.0.1 -P 8889 -u root < sql/schema.sql

# Si ya tenías la BD sin estado en contactos:
# mysql -h 127.0.0.1 -P 8889 -u root < sql/migration_estado_contactos.sql
```

### Modelo de datos

```
usuarios (1) ──┬──< usuario_correos   (N)   ← usuarios.correo_id apunta al de referencia
               └──< usuario_telefonos (N)   ← usuarios.telefono_id apunta al de referencia
```

| Tabla | Campos clave |
|--------|----------------|
| `usuarios` | `nombre`, `correo_id`, `telefono_id`, `estado`, auditoría |
| `usuario_correos` | `usuario_id`, `correo` (único) |
| `usuario_telefonos` | `usuario_id`, `telefono` único (ej. `+50241234567`) |

Al crear un usuario: se inserta el registro → se crean correos/teléfonos → se guardan los IDs de referencia en `usuarios`.

## 2. Configuración

```bash
cp .env.example .env.local
```

```env
DB_HOST=127.0.0.1
DB_PORT=8889
DB_USER=root
DB_PASSWORD=
DB_NAME=sistema_usuarios
# Opcional. Si no se define, created_at_user_id / updated_at_user_id
# usan el id del propio usuario.
# ACTOR_USER_ID=1
```

## 3. Instalar y levantar

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Funcionalidades

1. CRUD con varios **correos** y **teléfonos** (baja lógica también en contactos)
2. Inactivar usuario (baja lógica)
3. Teléfonos Centroamérica + opción Otro (Europa)
4. Búsqueda / filtro
5. Importación CSV / Excel (parcial)
6. Auditoría de creación y modificación

## Importación CSV / Excel

- Formatos: **`.csv`** y **`.xlsx`**
- Encabezados flexibles (mayúsculas, tildes, espacios): `NomBRE`, `cOrreo`, `TELefono`, etc.
- **Misma persona en varias filas:** si se repite el **mismo nombre**, se unen correos y teléfonos en **un solo usuario**.
- **Importación parcial:** si un grupo falla, el resto se guarda y se reporta el error.
- **Sin duplicados al reimportar:** si el correo (o el nombre) ya existe, se **actualiza** y se agregan los contactos nuevos.

Columnas: `nombre`, `correo`/`correos`, `telefono`/`telefonos`.
También puedes poner varios valores en una celda separados por `|` o `;`.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/users` | Listar |
| POST | `/api/users` | Crear |
| GET | `/api/users/:id` | Detalle |
| PUT | `/api/users/:id` | Actualizar (`updated_at_user_id`) |
| DELETE | `/api/users/:id` | Inactivar |
| POST | `/api/users/import` | Importar CSV / XLSX |