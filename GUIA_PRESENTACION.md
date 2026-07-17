# Guía de presentación — Sistema de Gestión de Usuarios

Documento para preparar la defensa oral de la prueba técnica (Desarrollador Jr).  
Incluye preguntas probables y respuestas alineadas a **este** proyecto.

---

## 1. Apertura (cómo empezar)

### ¿De qué trata el sistema?
Mini sistema interno para administrar usuarios de una plataforma: alta, edición, baja lógica, búsqueda/filtro, importación masiva CSV/Excel y listado usable.

### ¿Qué stack elegiste y por qué?
- **Next.js (App Router) + TypeScript:** un solo proyecto para UI y API, tipado, rápido de levantar.
- **MySQL + `mysql2` (sin ORM):** control directo del SQL, útil para demostrar modelo relacional y transacciones.
- **Tailwind:** UI clara sin invertir tiempo en diseño elaborado (como pide la prueba).

### ¿Cumple los 4 requisitos de la prueba?
| Requisito | Cómo se cumple |
|-----------|----------------|
| CRUD | Crear, ver, editar, inactivar (estado activo/inactivo) |
| Búsqueda y filtro | Busca por nombre/correo/teléfono; filtra por estado |
| Importación masiva | CSV y XLSX, parcial, con resumen de errores |
| Listado claro | Tabla paginada, preview de 2 contactos, detalle en “Ver” |

---

## 2. Demostración en vivo (orden sugerido)

1. Levantar el proyecto (`npm run dev`) y abrir el listado.
2. **Crear** un usuario con 2 correos y 2 teléfonos (mostrar selector de país).
3. **Buscar** por nombre o correo.
4. **Filtrar** activos / inactivos.
5. **Editar** y agregar otro teléfono.
6. **Ver** detalle completo.
7. **Inactivar** (baja lógica; el registro no desaparece).
8. **Importar** la plantilla CSV (o un Excel pequeño).
9. Mostrar resumen: insertados / actualizados / errores.
10. Reimportar el mismo archivo → se **actualizan**, no se duplican.

---

## 3. Arquitectura y código

### ¿Cómo está organizado el proyecto?
```
src/app/              → páginas y API Routes
src/components/       → UI (UsersManager)
src/lib/              → DB, reglas de negocio, validación, teléfonos, import
sql/schema.sql        → esquema de base de datos
public/plantilla-…    → plantilla de importación
```

### ¿Por qué API Routes y no un backend aparte?
Para una prueba Jr de alcance acotado, Next.js permite entregar full-stack en un solo repo, con endpoints REST claros (`/api/users`, `/api/users/import`).

### ¿Dónde está la lógica de negocio?
En `src/lib/users.ts` (CRUD, importación, fusión). La UI llama a la API; la API no mete SQL en el componente.

### ¿Usaste ORM? ¿Por qué no?
No. Con `mysql2` se ven joins, transacciones, índices y unicidad. Demuestra SQL real.

### ¿Cómo manejas configuración sensible?
Variables en `.env` (host, puerto, usuario, DB). Hay `.env.example` como plantilla. Los secretos no van en el código.

---

## 4. Base de datos

### ¿Cómo modelaste los datos?
```
usuarios (1) ──┬──< usuario_correos (N)     correo UNIQUE
               └──< usuario_telefonos (N)   telefono UNIQUE
```
`usuarios.correo_id` y `usuarios.telefono_id` apuntan al contacto de **referencia** (principal).

### ¿Por qué varias tablas y no todo en `usuarios`?
Porque un usuario puede tener **varios** correos y teléfonos. Normalizar evita columnas repetidas y permite unicidad global de contacto.

### ¿Por qué el correo y el teléfono son UNIQUE?
Identifican de forma única un canal de contacto: no puede haber dos usuarios con el mismo correo o el mismo teléfono.

### ¿El nombre es único?
No. Puede haber varios “Miguel Flores”. La unicidad está en correo/teléfono. En importación, filas con el **mismo nombre** se tratan como la misma persona (decisión de negocio para Excel).

### ¿Cómo se crea un usuario a nivel SQL? ¿Primero correo o primero usuario?
1. Insertar en `usuarios` (con `correo_id`/`telefono_id` en NULL).  
2. Insertar correos y teléfonos (necesitan `usuario_id`).  
3. Actualizar `correo_id` y `telefono_id` en `usuarios`.  

No se puede crear correo/teléfono antes: dependen de `usuario_id`.

### ¿Qué es la baja lógica?
`DELETE` en la API **no borra** la fila del usuario: pone `estado = 'inactivo'`.  
Igual con **correos y teléfonos**: al quitarlos en edición se ponen `inactivo` (no se eliminan). En **Ver** se ve cuáles están activos e inactivos. Conserva historial y auditoría.

### ¿Qué son `created_at_user_id` y `updated_at_user_id`?
Auditoría: quién creó/modificó. Si no hay operador en `.env` (`ACTOR_USER_ID`), se usa el **`id` del propio usuario**.

### ¿Qué índices hay y para qué?
Sobre `nombre`, `estado`, FKs, y UNIQUE en correo/teléfono → búsqueda y filtro más eficientes y datos consistentes.

---

## 5. CRUD y validaciones

### ¿Qué validas al crear/editar?
- Nombre obligatorio (máx. 150).
- Al menos un correo válido.
- Al menos un teléfono válido.
- Sin correos/teléfonos duplicados en el mismo usuario.
- Unicidad en BD (mensajes claros si ya existen en otro usuario).

### ¿Cómo manejas varios correos/teléfonos en el formulario?
Listas dinámicas: agregar/quitar. Teléfono con selector de país + número local limitado por dígitos del país.

### ¿Qué países de teléfono soportas?
Centroamérica (501–507) con longitud fija local, más opción **Otro** (internacional 8–15 dígitos). Se guarda en E.164 (`+50241234567`).

### ¿Por qué formato E.164?
Un solo valor comparable y UNIQUE; evita ambigüedad de “código + número” en columnas separadas.

### ¿Qué pasa si pongo un teléfono incompleto?
Validación en backend: mensaje con país y cantidad de dígitos esperados. No se guarda inválido.

---

## 6. Listado, búsqueda y filtro

### ¿Cómo es el listado?
Tabla paginada, columnas nombre / correos / teléfonos / estado / acciones. Preview de **2** contactos; el resto en **Ver**.

### ¿Por qué solo 2 en el listado?
Usabilidad: un usuario con 30 correos rompería la tabla. El detalle completo está en el modal Ver.

### ¿Cómo funciona la búsqueda?
`LIKE` sobre nombre, correos y teléfonos relacionados (EXISTS / subconsultas).

### ¿Cómo funciona el filtro?
Por `estado` (`activo` / `inactivo` / todos según UI).

### ¿Hay paginación? ¿Por qué?
Sí. Con miles/decenas de miles de filas no se puede cargar todo en una sola respuesta.

---

## 7. Importación masiva (tema caliente)

### ¿Qué formatos aceptas?
`.csv` y `.xlsx` (Excel).

### ¿Cómo normalizas encabezados?
Mapeo flexible: mayúsculas/minúsculas, tildes, alias (`correo`/`email`, `telefono`/`phone`, etc.).

### ¿Qué es importación parcial?
Si 1 fila/grupo falla, el resto se guarda. Se reporta qué no pasó y por qué.

### ¿Qué ves al terminar la importación?
Modal de resultado: total, exitosas, insertados, actualizados, no pasaron + tabla de errores. Sin botón “Importar” confuso; solo cerrar.

### ¿Misma persona en varias filas del Excel?
Si el **nombre** es el mismo (ignorando mayúsculas/espacios), se unen correos y teléfonos en **un usuario**.  
`Miguel Flores` ≠ `Miguel Flores L.` (son distintos).

### ¿Por qué unir por nombre y no solo por correo?
Porque en Excel a menudo copian el mismo nombre en filas nuevas para agregar otro correo/teléfono. Fue un requisito de uso real del archivo.

### ¿Riesgo de esa decisión?
Dos personas reales con exactamente el mismo nombre se fusionarían. Trade-off consciente; se puede endurecer después (ej. pedir documento o no fusionar solo por nombre).

### ¿Qué pasa al reimportar el mismo archivo?
Si el correo (o el nombre) ya existe → **actualiza** y agrega contactos. No duplica usuarios.

### ¿Cómo evitas el error “correo ya registrado en otro usuario” con el mismo nombre?
Se buscan todos los registros del mismo nombre / mismos contactos, se **fusionan** en uno (se mueven correos/tels) y se reclaman contactos del mismo nombre.

### ¿Transacciones?
Cada grupo de importación va en transacción: commit si OK, rollback si falla ese grupo.

### ¿Archivos grandes?
Hay spinner con tiempo transcurrido. Archivos muy grandes pueden tardar (procesamiento fila a fila / por grupo).

---

## 8. API

### ¿Qué endpoints tienes?
| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/users` | Listar (q, estado, page, limit) |
| POST | `/api/users` | Crear |
| GET | `/api/users/:id` | Detalle |
| PUT | `/api/users/:id` | Actualizar |
| DELETE | `/api/users/:id` | Inactivar |
| POST | `/api/users/import` | Importar archivo |

### ¿REST?
Sí, estilo REST sobre recursos `users`. DELETE semántico = baja lógica.

### ¿Cómo manejas errores?
Validación → 400; no encontrado → 404; duplicados → mensaje claro; errores de DB mapeados a mensajes legibles.

---

## 9. Seguridad y calidad (preguntas típicas de entrevista)

### ¿Hay autenticación/login?
No en esta prueba (alcance acotado). En producción: login, roles, solo admins gestionan usuarios.

### ¿SQL injection?
Consultas parametrizadas con `mysql2` (`?` / named params), no concatenar input crudo en SQL.

### ¿Validación solo en frontend?
No. El backend valida siempre (`validations.ts` / reglas en `users.ts`). El front mejora UX.

### ¿XSS?
React escapa texto por defecto. No se renderiza HTML crudo del usuario.

### ¿Qué pondrías en producción que falta hoy?
Auth, rate limit en import, colas para archivos grandes, tests automatizados, logs, backups, HTTPS, roles.

### ¿Hay tests?
No unitarios/e2e en el entregable. Validación manual + casos de importación. Mejorable con Jest/Playwright.

---

## 10. Decisiones y trade-offs

### ¿Por qué TypeScript?
Menos errores en contratos API/UI y refactor más seguro.

### ¿Por qué no borrado físico?
Datos de negocio suelen requerir historial; inactivar basta para “dar de baja”.

### ¿Por qué MySQL y no Mongo?
Datos relacionales claros (1 usuario → N contactos) y unicidad de correo/teléfono encajan mejor en SQL.

### ¿Qué mejorarías con más tiempo?
1. Auth y roles.  
2. Tests.  
3. Import en background (cola + progreso real).  
4. Regla de fusión más fina (no solo nombre).  
5. Exportar usuarios.  
6. Soft-delete de contactos individuales con historial.

---

## 11. Preguntas difíciles / trampas

### “¿Nombre repetido es duplicado?”
No por sí solo. Duplicado real = mismo correo o mismo teléfono. Nombre igual en Excel = misma persona **solo en importación** (regla de negocio).

### “¿Por qué no usaste Prisma/Eloquent?”
Decisión didáctica: SQL explícito, transacciones y modelo a la vista.

### “¿El DELETE borra?”
No: inactiva.

### “¿Dónde está la fecha de registro?”
`fecha_registro` / `created_at` en `usuarios`; se asigna al crear (timestamp).

### “¿Cómo levantas el proyecto?”
Node 20+, MySQL, `sql/schema.sql`, `.env`, `npm install`, `npm run dev` → `http://localhost:3000`. Detalle en README.

### “¿Qué pasa si el Excel tiene encabezados raros?”
El parser normaliza y mapea alias; si falta nombre/correo/teléfono válidos, esa fila/grupo falla con motivo.

### “¿Escalabilidad a 1 millón de filas?”
La importación actual es síncrona y por grupos; para 1M haría falta cola, batch inserts y más hardware. El diseño de BD (índices/UNIQUE) sí aguanta lectura paginada.

### “¿Por qué Next 16 / App Router?”
Stack moderno, API + UI juntos; la prueba no exige microservicios.

### “Muéstrame el flujo de importación en código”
1. `POST /api/users/import` recibe el archivo.  
2. `parseImportFile` → filas.  
3. `importUsuarios` agrupa por nombre, valida, fusiona/inserta/actualiza.  
4. Respuesta con contadores + errores.  
5. UI muestra solo el resumen.

### “Si falló la importación a mitad, ¿queda a medias?”
Por **grupo** (persona): si falla, ese grupo hace rollback; los grupos anteriores ya confirmados se quedan (importación parcial intencional).

---

## 12. Preguntas sobre ti / proceso (soft)

### ¿Cuánto te tomó?
(Responde con honestidad; la prueba sugiere ~2 días.)

### ¿Qué fue lo más difícil?
Ejemplos fuertes: modelar N correos/tels, importación parcial + fusión por nombre, teléfonos E.164, listado usable con muchos contactos.

### ¿Qué aprendiste?
Transacciones, unicidad, UX de importación, trade-offs de deduplicación.

### ¿Trabajarías en equipo cómo documentarías esto?
README de setup + este tipo de decisiones en PRs/comentarios de diseño.

---

## 13. Checklist día de la presentación

- [ ] MySQL arriba (MAMP/TablePlus) y `schema.sql` aplicado  
- [ ] `.env` correcto  
- [ ] `npm run dev` responde en localhost  
- [ ] Datos de demo listos (1 usuario manual + plantilla CSV)  
- [ ] Repo en GitHub accesible + README actualizado  
- [ ] Repasar modelo 1–N y orden de inserts  
- [ ] Repasar importación parcial y fusión por nombre  
- [ ] Tener 2–3 mejoras futuras claras  

---

## 14. Frase de cierre sugerida

> “Entregué un CRUD completo con búsqueda, listado usable e importación masiva robusta (parcial, CSV/Excel, fusión por nombre y auditoría). El diseño prioriza datos consistentes en MySQL y una API clara; con más tiempo sumaría autenticación, tests e importación asíncrona para volúmenes muy grandes.”

---

## 15. Mapa rápido “pregunta → archivo”

| Tema | Dónde mirar |
|------|-------------|
| Listado / UI | `src/components/UsersManager.tsx` |
| CRUD / import | `src/lib/users.ts` |
| Teléfonos | `src/lib/phones.ts` |
| Validación | `src/lib/validations.ts` |
| Parse CSV/XLSX | `src/lib/import-file.ts` |
| Conexión DB | `src/lib/db.ts` |
| Esquema | `sql/schema.sql` |
| API | `src/app/api/users/**` |
| Setup | `README.md` |
