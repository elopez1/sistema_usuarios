# Sistema de usuarios

CRUD interno de usuarios con varios correos/teléfonos, búsqueda, filtro por estado e importación masiva CSV/Excel.

## Tecnologías

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **MySQL** + **mysql2**
- **Tailwind CSS 4**
- **xlsx** (importación Excel)

## Requisitos previos


| Requisito | Notas |
|-----------|--------|
| **Node.js 20+** | Incluye `npm`. Verificar con `node -v`. |
| **MySQL** | Local (MAMP, Homebrew, Docker, etc.). Debe estar **encendido** antes de usar la app. |
| **Git** | Para clonar el repositorio. |

## Cómo ejecutar en otra máquina

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPO> sistema_usuarios
cd sistema_usuarios
```

Si el código vive en la rama `develop`:

```bash
git checkout develop
```

> No hace falta `git init`: al clonar el repositorio ya viene con Git.

### 2. Instalar dependencias

```bash
npm install
```

### 3. Crear la base de datos

Con MySQL en marcha, aplica el esquema:

```bash
# Puerto por defecto de MySQL (3306):
mysql -h 127.0.0.1 -P 3306 -u root -p < sql/schema.sql

# Si usas MAMP en macOS, el puerto suele ser 8889:
mysql -h 127.0.0.1 -P 8889 -u root < sql/schema.sql
```

Eso crea la base `sistema_usuarios` y las tablas `usuarios`, `usuario_correos`, `usuario_telefonos`.

> Solo si la base **ya existía** de una versión anterior (sin `estado` en contactos), aplica también:
> `mysql ... < sql/migration_estado_contactos.sql`

### 4. Configurar variables de entorno

```bash
cp .env
```

Edita `.env` con los datos de **tu** MySQL:

```env
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
```

Ajusta `DB_PORT` / `DB_PASSWORD` según tu instalación (MAMP → a menudo `8889` y contraseña vacía).

Opcional: `ACTOR_USER_ID` para auditoría (ver comentarios en `.env.example`).


### 5. Levantar la aplicación

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Para ejecutar proyecto de forma local:

```bash
npm run start
```

## Plantilla de importación

Hay un CSV de ejemplo en `public/plantilla-usuarios.csv` (columnas `nombre`, `correo`, `telefono`). También se puede subir `.xlsx`.

## API (resumen)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/users` | Listar (`q`, `estado`, `page`, `limit`) |
| POST | `/api/users` | Crear |
| GET | `/api/users/:id` | Detalle |
| PUT | `/api/users/:id` | Actualizar |
| DELETE | `/api/users/:id` | Inactivar (baja lógica) |
| POST | `/api/users/import` | Importar CSV / XLSX (`FormData` campo `file`) |

## Problemas frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| Error de conexión a MySQL | MySQL encendido; `DB_HOST` / `DB_PORT` / usuario / contraseña en `.env.local`. |
| Base o tablas no existen | Ejecutar `sql/schema.sql`. |
| Puerto 3306 vs 8889 | MAMP suele usar **8889**; MySQL “normal” usa **3306**. |
| `npm` no encontrado | Instalar Node.js 20+. |
| Página vacía / API falla | Reiniciar `npm run dev` después de crear o cambiar `.env.local`. |

