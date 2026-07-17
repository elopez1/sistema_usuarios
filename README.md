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
ACTOR_USER_ID=1
```

En la UI, el campo **ID operador** envía quién realiza cada acción (`X-Actor-User-Id`).

## 3. Instalar y levantar

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Funcionalidades

1. CRUD con varios **correos** y **teléfonos**
2. Inactivar (baja lógica)
3. Teléfonos Centroamérica + opción Otro (Europa)
4. Búsqueda / filtro
5. Importación CSV / Excel (parcial)
6. Auditoría de creación y modificación

## Importación CSV / Excel

- Formatos: **`.csv`** y **`.xlsx`**
- Encabezados flexibles (mayúsculas, tildes, espacios): `NomBRE`, `cOrreo`, `TELefono`, `Teléfono`, `CóDIGO_PAÍS`, etc.
- **Importación parcial:** si de 100 filas falla 1, se guardan las 99 y se reporta el error de la fila fallida.
- **Sin duplicados al reimportar:** si vuelves a subir los 100 (con el error corregido), los 99 existentes se **actualizan** por correo y el corregido se **inserta**. La clave es el correo (único).

Columnas reconocidas: `nombre`, `correo`/`correos`, `telefono`/`telefonos`.
El teléfono se guarda completo en una sola columna (ej. `+50241234567`).
Si viene sin código y tiene 8 dígitos, se asume Guatemala. Si viene con código duplicado (`+502502…`), se corrige.
Varios valores en una celda separados por `|` o `;`.

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/users` | Listar |
| POST | `/api/users` | Crear |
| GET | `/api/users/:id` | Detalle |
| PUT | `/api/users/:id` | Actualizar (`updated_at_user_id`) |
| DELETE | `/api/users/:id` | Inactivar |
| POST | `/api/users/import` | Importar CSV / XLSX |