# Cómo funciona el código (guía para no expertos en Next.js)

Esta guía explica **cómo está armado el proyecto**, **cómo se conectan las piezas** y **qué pasos seguir si quieres agregar otra tabla** (por ejemplo `roles`, `departamentos`, etc.).

No necesitas saber Next.js de memoria: aquí está el mapa del proyecto.

---

## 1. Idea general (3 capas)

Piensa el sistema como un sándwich:

```
┌─────────────────────────────────────┐
│  PANTALLA (React)                   │  ← lo que ves: botones, tablas, formularios
│  src/components/UsersManager.tsx    │
└─────────────────┬───────────────────┘
                  │ fetch("/api/users")
                  ▼
┌─────────────────────────────────────┐
│  API (rutas de Next.js)             │  ← recibe pedidos HTTP (GET, POST, PUT…)
│  src/app/api/users/...              │
└─────────────────┬───────────────────┘
                  │ llama funciones
                  ▼
┌─────────────────────────────────────┐
│  LÓGICA + BASE DE DATOS             │  ← reglas + SQL
│  src/lib/users.ts , db.ts , etc.    │
│  MySQL (tablas en sql/schema.sql)   │
└─────────────────────────────────────┘
```

**Regla de oro:** la pantalla **no habla directo con MySQL**. Siempre pasa por la API.

---

## 2. ¿Qué es Next.js en este proyecto?

Next.js es un framework de **React** que además te deja crear **APIs** en el mismo proyecto.

| Concepto | En este repo |
|----------|----------------|
| Página web | `src/app/page.tsx` → muestra `UsersManager` |
| Layout (envoltorio) | `src/app/layout.tsx` → título, fuente, CSS |
| API | carpetas `src/app/api/.../route.ts` |
| Estilos | Tailwind + `src/app/globals.css` |
| Tipado | TypeScript (`.ts` / `.tsx`) |

### App Router (importante)

Las carpetas dentro de `src/app/` **son rutas**:

| Archivo / carpeta | URL |
|-------------------|-----|
| `src/app/page.tsx` | `http://localhost:3000/` |
| `src/app/api/users/route.ts` | `/api/users` |
| `src/app/api/users/[id]/route.ts` | `/api/users/24` |
| `src/app/api/users/import/route.ts` | `/api/users/import` |

`[id]` significa un valor dinámico (el número del usuario).

En cada `route.ts` exportas funciones con el nombre del método HTTP:

```ts
export async function GET(request) { ... }   // listar
export async function POST(request) { ... }  // crear
export async function PUT(request) { ... }   // actualizar
export async function DELETE(request) { ... } // aquí: inactivar
```

---

## 3. Mapa de carpetas (qué tocar y para qué)

```
sistema_usuarios/
├── sql/
│   ├── schema.sql                      ← crea la BD y tablas (instalación limpia)
│   └── migration_estado_contactos.sql  ← cambios si la BD ya existía
├── public/
│   └── plantilla-usuarios.csv          ← archivos estáticos (descargas)
├── src/
│   ├── app/
│   │   ├── page.tsx                    ← página principal
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/users/                  ← endpoints REST
│   ├── components/
│   │   └── UsersManager.tsx            ← toda la UI del CRUD
│   └── lib/                            ← cerebro del sistema
│       ├── db.ts                       ← conexión a MySQL
│       ├── types.ts                    ← formas de los datos (TypeScript)
│       ├── validations.ts              ← reglas: correo válido, etc.
│       ├── phones.ts                   ← países y formato de teléfono
│       ├── users.ts                    ← CRUD + importación (SQL)
│       ├── import-file.ts              ← leer CSV/Excel
│       └── actor.ts                    ← quién hizo la acción (auditoría)
├── .env                                ← host, usuario, password de MySQL
├── README.md                           ← cómo levantarlo
└── package.json                        ← dependencias y scripts (npm run dev)
```

### Alias `@/`

Cuando ves:

```ts
import { getPool } from "@/lib/db";
```

`@/` significa `src/`. Es un atajo configurado en `tsconfig.json`.

---

## 4. Flujo completo: “Crear un usuario” (paso a paso)

1. En la UI llenas el formulario y das **Guardar**.
2. `UsersManager` hace:

```ts
fetch("/api/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nombre, correos, telefonos }),
});
```

3. Next ejecuta `POST` en `src/app/api/users/route.ts`.
4. Ese archivo llama `createUsuario(...)` en `src/lib/users.ts`.
5. `createUsuario`:
   - valida datos (`validations.ts`)
   - abre transacción MySQL
   - inserta en `usuarios`
   - inserta correos/tels
   - actualiza `correo_id` / `telefono_id`
   - commit
6. La API responde JSON con el usuario creado.
7. La UI recarga el listado.

Si algo falla en el medio → **rollback** (no queda a medias).

---

## 5. Esquema de base de datos (cómo está modelado)

### Diagrama

```
usuarios
  id
  nombre
  correo_id  ──────────────►  usuario_correos.id   (correo de referencia)
  telefono_id ─────────────►  usuario_telefonos.id (teléfono de referencia)
  fecha_registro
  estado (activo | inactivo)
  created_at / updated_at
  created_at_user_id / updated_at_user_id

usuario_correos
  id
  usuario_id  ─────────────►  usuarios.id
  correo (UNIQUE)
  estado (activo | inactivo)
  auditoría…

usuario_telefonos
  id
  usuario_id  ─────────────►  usuarios.id
  telefono (UNIQUE)   ej. +50241234567
  estado (activo | inactivo)
  auditoría…
```

### Por qué 3 tablas y no todo en una

Un usuario puede tener **varios** correos y **varios** teléfonos.  
Si metieras `correo1`, `correo2`, `correo3`… se vuelve un lío.  
Con tablas hijas (`usuario_correos`, `usuario_telefonos`) es flexible.

### Orden al insertar (importante)

1. Crear fila en `usuarios` (con `correo_id` y `telefono_id` en `NULL`).
2. Crear filas en `usuario_correos` / `usuario_telefonos` (necesitan `usuario_id`).
3. Actualizar `usuarios.correo_id` y `usuarios.telefono_id` con el primer contacto activo.

No se puede crear el correo antes que el usuario: el correo necesita `usuario_id`.

### Baja lógica

| Acción en la app | Qué pasa en BD |
|------------------|----------------|
| Inactivar usuario | `usuarios.estado = 'inactivo'` (no DELETE) |
| Quitar un correo/tel en edición | `estado = 'inactivo'` en esa fila (no se borra) |

Así se conserva historial.

### Archivo fuente del esquema

Todo está en:

```text
sql/schema.sql
```

Si la BD ya existía y solo agregas columnas, usas un archivo `sql/migration_….sql` (como `migration_estado_contactos.sql`).

---

## 6. Variables de entorno (`.env`)

Ejemplo:

```env
DB_HOST=127.0.0.1
DB_PORT=8889
DB_USER=root
DB_PASSWORD=
DB_NAME=sistema_usuarios
```

`src/lib/db.ts` lee esas variables para conectarse a MySQL.  
Si cambias el `.env`, reinicia `npm run dev`.

---

## 7. Cómo agregar otra tabla (receta paso a paso)

Imagina que quieres una tabla **`departamentos`** con: `id`, `nombre`, `estado`.

### Paso A — SQL

En `sql/schema.sql` (o un `sql/migration_departamentos.sql`):

```sql
USE sistema_usuarios;

CREATE TABLE IF NOT EXISTS departamentos (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_departamento_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Ejecutar en MySQL (MAMP ejemplo):

```bash
/Applications/MAMP/Library/bin/mysql -h 127.0.0.1 -P 8889 -u root < sql/migration_departamentos.sql
```

### Paso B — Tipos TypeScript

En `src/lib/types.ts`:

```ts
export interface Departamento {
  id: number;
  nombre: string;
  estado: "activo" | "inactivo";
  created_at: string;
  updated_at: string;
}

export interface DepartamentoInput {
  nombre: string;
  estado?: "activo" | "inactivo";
}
```

### Paso C — Lógica + SQL (`src/lib/departamentos.ts`)

Copia el estilo de `users.ts`, más simple:

```ts
import { getPool, ResultSetHeader, RowDataPacket } from "./db";
import type { Departamento, DepartamentoInput } from "./types";

export async function listDepartamentos() {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, nombre, estado, created_at, updated_at
     FROM departamentos
     ORDER BY nombre ASC`
  );
  return rows as Departamento[];
}

export async function createDepartamento(input: DepartamentoInput) {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO departamentos (nombre, estado) VALUES (?, 'activo')`,
    [input.nombre.trim()]
  );
  // luego SELECT por result.insertId y return
}
```

### Paso D — API

Crea:

```text
src/app/api/departamentos/route.ts
```

```ts
import { NextRequest, NextResponse } from "next/server";
import { listDepartamentos, createDepartamento } from "@/lib/departamentos";

export async function GET() {
  const data = await listDepartamentos();
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const created = await createDepartamento(body);
  return NextResponse.json(created, { status: 201 });
}
```

Para editar/borrar: `src/app/api/departamentos/[id]/route.ts` con `PUT` / `DELETE`.

### Paso E — UI

1. Crea `src/components/DepartamentosManager.tsx` (puedes copiar ideas de `UsersManager`).
2. En `src/app/page.tsx` muéstralo, o crea otra página:

```text
src/app/departamentos/page.tsx
```

```tsx
import DepartamentosManager from "@/components/DepartamentosManager";

export default function Page() {
  return <DepartamentosManager />;
}
```

Eso abre en `http://localhost:3000/departamentos`.

### Paso F — Relacionar con usuarios (opcional)

Si cada usuario pertenece a un departamento:

```sql
ALTER TABLE usuarios
  ADD COLUMN departamento_id INT(10) UNSIGNED NULL,
  ADD KEY idx_usuarios_departamento (departamento_id),
  ADD CONSTRAINT fk_usuarios_departamento
    FOREIGN KEY (departamento_id) REFERENCES departamentos (id)
    ON DELETE SET NULL;
```

Luego agregas el campo en el formulario de usuarios y en `createUsuario` / `updateUsuario`.

---

## 8. Checklist mental al agregar cualquier cosa nueva

1. **¿Dónde vive el dato?** → tabla SQL  
2. **¿Cómo se ve en TypeScript?** → `types.ts`  
3. **¿Quién escribe el SQL?** → archivo en `src/lib/`  
4. **¿Quién lo expone por HTTP?** → `src/app/api/.../route.ts`  
5. **¿Quién lo muestra?** → componente + `fetch`  
6. **¿Hay validación?** → no confíes solo en el formulario; valida en `lib/`  
7. **¿Es borrado o inactivar?** → en este proyecto preferimos `estado = inactivo`

---

## 9. Comandos que sí debes recordar

```bash
# instalar dependencias (solo la primera vez / cuando cambie package.json)
npm install

# levantar el sistema
npm run dev

# aplicar esquema limpio
mysql -h 127.0.0.1 -P 8889 -u root < sql/schema.sql
```

Abre: [http://localhost:3000](http://localhost:3000)

---

## 10. Errores comunes y qué significan

| Síntoma | Causa probable |
|---------|----------------|
| Error de conexión a MySQL | MAMP apagado, puerto mal en `.env` (aquí suele ser `8889`) |
| `Unknown column 'estado'` | Falta correr la migración SQL |
| `Duplicate entry` en correo/teléfono | Ese valor ya existe (UNIQUE) |
| La UI no refleja cambios de código | Reinicia `npm run dev` o recarga fuerte el navegador |
| `404` en `/api/...` | Ruta/carpeta mal nombrada bajo `src/app/api` |

---

## 11. Dónde mirar según lo que quieras cambiar

| Quiero… | Archivo |
|---------|---------|
| Cambiar textos/botones de la pantalla | `UsersManager.tsx` |
| Cambiar validación de correo/teléfono | `validations.ts` / `phones.ts` |
| Cambiar cómo se guarda un usuario | `users.ts` |
| Cambiar o agregar columnas | `sql/schema.sql` (+ migración) |
| Agregar un endpoint nuevo | `src/app/api/.../route.ts` |
| Cambiar puerto/usuario de BD | `.env` |
| Entender la prueba / presentación | `GUIA_PRESENTACION.md` |
| Cómo funciona el código | `COMO_FUNCIONA_EL_CODIGO.md` |
| Levantar el proyecto | `README.md` |

---

## 12. Subir cambios a Git / GitHub (paso a paso)

Git guarda el historial del código. **GitHub** es donde está el repositorio remoto para que otros (o el reclutador) lo vean.

En este proyecto la rama actual suele ser `develop` y el remoto se llama `origin`.

### Antes de subir: ¿qué NO debes subir?

- **Nunca** subas `.env` (tiene datos de tu máquina / contraseñas). Ya está ignorado en `.gitignore`.
- No subas `node_modules/` ni `.next/` (también ignorados).
- Sí sube: código en `src/`, `sql/`, `README.md`, guías `.md`, etc.

### Ejemplo: no quiero que un archivo suba a GitHub

Usa el archivo **`.gitignore`** en la raíz del proyecto. Todo lo que listes ahí Git lo ignora (no entra en `git add` ni en GitHub).

#### 1) Abrir o crear `.gitignore`

En la raíz (`sistema_usuarios/.gitignore`) agrega una línea con el nombre o ruta del archivo/carpeta.

#### 2) Ejemplos prácticos

```gitignore
# Ya suelen estar (no tocar si ya existen):
.env
.env*
node_modules/
.next/

# Ejemplo: no subir notas personales
notas-privadas.md
mis-apuntes.txt

# Ejemplo: no subir una carpeta completa
tmp/
backups/

# Ejemplo: no subir un archivo dentro de una carpeta
sql/datos-prueba-locales.sql
public/secreto.csv

# Ejemplo: no subir por extensión
*.log
*.xlsx
```

#### 3) Comprobar que funciona

```bash
git status
```

Si el archivo aparece como `??` (sin seguimiento) y **después** de agregarlo a `.gitignore` **desaparece** de `git status`, está bien: Git ya lo ignora.

#### 4) ¿Y si el archivo ya se había subido antes?

`.gitignore` solo evita archivos **nuevos**. Si ya estaba en el repo, hay que quitarlo del seguimiento (sin borrarlo de tu disco):

```bash
# Deja de trackear el archivo, pero lo conserva en tu carpeta local
git rm --cached notas-privadas.md

git add .gitignore
git commit -m "Deja de versionar notas-privadas.md"
git push origin develop
```

A partir de ahí ese archivo ya no se sube en commits futuros.

#### 5) Subir solo algunos archivos (sin ignorar el resto)

Si el archivo **sí** puede existir en el proyecto pero en este commit no lo quieres incluir, no uses `git add .`; agrega solo lo que sí va:

```bash
git add README.md src/lib/users.ts
git commit -m "Actualiza logica de usuarios"
git push origin develop
```

Así `COMO_FUNCIONA_EL_CODIGO.md` (u otro archivo) se queda fuera **de ese commit**, aunque no esté en `.gitignore`.

### Comandos básicos (en la carpeta del proyecto)

Abre la terminal en:

```bash
cd /Users/elvis.lopez/proyecto_cliente/sistema_usuarios
```

#### 1) Ver qué cambió

```bash
git status
```

- `M` = modificado  
- `??` = archivo nuevo (aún no tracked)

#### 2) Ver el detalle de cambios (opcional)

```bash
git diff
```

#### 3) Agregar archivos al “staging” (preparar el commit)

Todo lo pendiente:

```bash
git add .
```

O solo archivos concretos:

```bash
git add README.md src/lib/users.ts sql/migration_estado_contactos.sql
```

#### 4) Crear el commit (foto del cambio)

```bash
git commit -m "Describe en una frase qué hiciste"
```

Ejemplos de mensajes claros:

```bash
git commit -m "Agrega estado activo/inactivo a correos y telefonos"
git commit -m "Documenta como funciona el codigo y la guia de presentacion"
```

Si te dice que no hay nada que commitear: o no hiciste `git add`, o no hay cambios.

#### 5) Subir a GitHub

```bash
git push origin develop
```

Si es la primera vez que esa rama se sube:

```bash
git push -u origin develop
```

### Resumen rápido (lo que usarás casi siempre)

```bash
git status
git add .
git commit -m "Tu mensaje claro"
git push origin develop
```

### Si el push pide usuario/contraseña o falla por SSH

- Con **SSH** (como en este repo: `git@github-...`): asegúrate de tener tu llave cargada en GitHub.
- Con **HTTPS**: GitHub ya no usa la contraseña de la cuenta; usa un *Personal Access Token*.

Si no estás seguro, en Cursor/terminal puedes pedir ayuda con el mensaje exacto del error.

### Crear el repo en GitHub la primera vez (si aún no existiera)

1. Crea un repositorio vacío en GitHub (sin README si ya tienes código local).
2. Enlaza el remoto:

```bash
git remote add origin git@github.com:TU_USUARIO/sistema_usuarios.git
```

3. Sube:

```bash
git push -u origin develop
```

(En este proyecto el `origin` **ya está configurado**; normalmente solo haces `add` → `commit` → `push`.)

### Buenas prácticas simples

1. Haz commits **pequeños** y con mensaje claro.  
2. Antes de presentar, verifica en GitHub que se vean los archivos nuevos.  
3. No hagas `push --force` a menos que sepas exactamente por qué.  
4. Si trabajas en equipo: `git pull` antes de `git push` para traer cambios remotos.

### Errores comunes de Git

| Mensaje / situación | Qué hacer |
|---------------------|-----------|
| `nothing to commit` | No hay cambios, o faltó `git add` |
| `rejected` / `non-fast-forward` | Alguien subió antes; haz `git pull` y luego `push` |
| No aparece `.env` en GitHub | Es correcto: está en `.gitignore` |
| Subiste algo por error | Avisa; no subas secretos. Se puede quitar del historial con cuidado |

### Entrega de la prueba técnica

Para el reclutador normalmente basta:

1. Código en GitHub (rama `develop` o `main` actualizada).  
2. `README.md` con cómo levantarlo.  
3. (Opcional) las guías `GUIA_PRESENTACION.md` y `COMO_FUNCIONA_EL_CODIGO.md`.

---

## 13. Resumen en una frase

> **Next muestra la página → la página llama a `/api/...` → la API usa `src/lib` → `src/lib` habla con MySQL según `sql/schema.sql`.**

Si copias ese patrón (SQL → types → lib → api → UI), puedes agregar tablas aunque no seas experto en Next: solo repite la receta de la sección 7.

Para guardar tu trabajo en la nube: **`git add` → `git commit` → `git push`**.
