import { PoolConnection } from "mysql2/promise";
import { getPool, ResultSetHeader, RowDataPacket } from "./db";
import {
  normalizeTelefonoValue,
  parseTelefonoFlexible,
} from "./phones";
import type {
  CorreoUsuario,
  ImportResult,
  PaginatedUsuarios,
  TelefonoUsuario,
  Usuario,
  UsuarioFilters,
  UsuarioInput,
} from "./types";
import { sanitizeUsuarioInput, validateUsuarioInput } from "./validations";

type UsuarioRow = RowDataPacket & {
  id: number;
  nombre: string;
  correo_id: number | null;
  telefono_id: number | null;
  fecha_registro: string;
  estado: Usuario["estado"];
  created_at: string;
  updated_at: string;
  created_at_user_id: number | null;
  updated_at_user_id: number | null;
};

type TelefonoRow = RowDataPacket & {
  id: number;
  usuario_id: number;
  telefono: string;
  estado: "activo" | "inactivo";
  created_at: string;
  updated_at: string;
  created_at_user_id: number | null;
  updated_at_user_id: number | null;
};

type CorreoRow = RowDataPacket & {
  id: number;
  usuario_id: number;
  correo: string;
  estado: "activo" | "inactivo";
  created_at: string;
  updated_at: string;
  created_at_user_id: number | null;
  updated_at_user_id: number | null;
};

function auditFromRow(row: {
  created_at: string;
  updated_at: string;
  created_at_user_id: number | null;
  updated_at_user_id: number | null;
}) {
  return {
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_at_user_id:
      row.created_at_user_id != null ? Number(row.created_at_user_id) : null,
    updated_at_user_id:
      row.updated_at_user_id != null ? Number(row.updated_at_user_id) : null,
  };
}

async function loadTelefonos(
  usuarioIds: number[],
  connection?: PoolConnection
): Promise<Map<number, TelefonoUsuario[]>> {
  const map = new Map<number, TelefonoUsuario[]>();
  if (!usuarioIds.length) return map;

  const db = connection ?? getPool();
  const placeholders = usuarioIds.map(() => "?").join(", ");

  const [rows] = await db.query<TelefonoRow[]>(
    `SELECT id, usuario_id, telefono, estado,
            created_at, updated_at, created_at_user_id, updated_at_user_id
     FROM usuario_telefonos
     WHERE usuario_id IN (${placeholders})
     ORDER BY FIELD(estado, 'activo', 'inactivo'), id ASC`,
    usuarioIds
  );

  for (const row of rows) {
    const list = map.get(row.usuario_id) ?? [];
    list.push({
      id: row.id,
      telefono: row.telefono,
      estado: row.estado,
      ...auditFromRow(row),
    });
    map.set(row.usuario_id, list);
  }

  return map;
}

async function loadCorreos(
  usuarioIds: number[],
  connection?: PoolConnection
): Promise<Map<number, CorreoUsuario[]>> {
  const map = new Map<number, CorreoUsuario[]>();
  if (!usuarioIds.length) return map;

  const db = connection ?? getPool();
  const placeholders = usuarioIds.map(() => "?").join(", ");

  const [rows] = await db.query<CorreoRow[]>(
    `SELECT id, usuario_id, correo, estado,
            created_at, updated_at, created_at_user_id, updated_at_user_id
     FROM usuario_correos
     WHERE usuario_id IN (${placeholders})
     ORDER BY FIELD(estado, 'activo', 'inactivo'), id ASC`,
    usuarioIds
  );

  for (const row of rows) {
    const list = map.get(row.usuario_id) ?? [];
    list.push({
      id: row.id,
      correo: row.correo,
      estado: row.estado,
      ...auditFromRow(row),
    });
    map.set(row.usuario_id, list);
  }

  return map;
}

function activosCorreos(correos: CorreoUsuario[]): CorreoUsuario[] {
  return correos.filter((c) => (c.estado ?? "activo") === "activo");
}

function activosTelefonos(telefonos: TelefonoUsuario[]): TelefonoUsuario[] {
  return telefonos.filter((t) => (t.estado ?? "activo") === "activo");
}

function resolveCorreo(
  correoId: number | null,
  correos: CorreoUsuario[]
): string {
  const activos = activosCorreos(correos);
  if (correoId != null) {
    const found = activos.find((c) => c.id === correoId);
    if (found) return found.correo;
  }
  return activos[0]?.correo ?? "";
}

function resolveTelefono(
  telefonoId: number | null,
  telefonos: TelefonoUsuario[]
): string {
  const activos = activosTelefonos(telefonos);
  if (telefonoId != null) {
    const found = activos.find((t) => t.id === telefonoId);
    if (found) return found.telefono;
  }
  return activos[0]?.telefono ?? "";
}

function mapUsuario(
  row: UsuarioRow,
  correos: CorreoUsuario[] = [],
  telefonos: TelefonoUsuario[] = []
): Usuario {
  const correo_id = row.correo_id != null ? Number(row.correo_id) : null;
  const telefono_id = row.telefono_id != null ? Number(row.telefono_id) : null;

  return {
    id: row.id,
    nombre: row.nombre,
    correo_id,
    telefono_id,
    correo: resolveCorreo(correo_id, correos),
    telefono: resolveTelefono(telefono_id, telefonos),
    correos,
    telefonos,
    fecha_registro: String(row.fecha_registro),
    estado: row.estado,
    ...auditFromRow(row),
  };
}

/** Elimina usuarios sin contactos (restos de fusión). */
async function deleteEmptyUsers(
  connection: PoolConnection,
  candidateIds: number[],
  keepId: number
): Promise<void> {
  for (const id of candidateIds) {
    if (id === keepId) continue;
    const [cRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM usuario_correos WHERE usuario_id = ?`,
      [id]
    );
    const [tRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM usuario_telefonos WHERE usuario_id = ?`,
      [id]
    );
    if (Number(cRows[0]?.n) === 0 && Number(tRows[0]?.n) === 0) {
      await connection.execute(
        `UPDATE usuarios SET correo_id = NULL, telefono_id = NULL WHERE id = ?`,
        [id]
      );
      await connection.execute(`DELETE FROM usuarios WHERE id = ?`, [id]);
    }
  }
}

/** Sincroniza teléfonos: los quitados se inactivan (no se borran). */
async function replaceTelefonos(
  connection: PoolConnection,
  usuarioId: number,
  telefonos: TelefonoUsuario[],
  actorUserId: number | null,
  opts?: { claimNombreKey?: string }
): Promise<number | null> {
  const orphans = new Set<number>();
  const desired = telefonos
    .map((t) => normalizeTelefonoValue(t.telefono))
    .filter(Boolean);
  const desiredUnique = [...new Set(desired)];

  for (const telefono of desiredUnique) {
    const [dup] = await connection.query<RowDataPacket[]>(
      `SELECT t.id, t.usuario_id, u.nombre
       FROM usuario_telefonos t
       INNER JOIN usuarios u ON u.id = t.usuario_id
       WHERE t.telefono = :telefono
       LIMIT 1`,
      { telefono }
    );

    if (dup[0] && Number(dup[0].usuario_id) !== usuarioId) {
      const ownerId = Number(dup[0].usuario_id);
      if (
        opts?.claimNombreKey &&
        normalizeNombreKey(String(dup[0].nombre)) === opts.claimNombreKey
      ) {
        await connection.execute(
          `UPDATE usuarios SET telefono_id = NULL WHERE id = :id`,
          { id: ownerId }
        );
        await connection.execute(
          `UPDATE usuario_telefonos
           SET usuario_id = :uid, estado = 'activo', updated_at_user_id = :actor
           WHERE id = :id`,
          { uid: usuarioId, actor: actorUserId, id: Number(dup[0].id) }
        );
        orphans.add(ownerId);
      } else {
        throw new ValidationError(
          `El teléfono ${telefono} ya está registrado en otro usuario.`
        );
      }
    }
  }

  const [existing] = await connection.query<RowDataPacket[]>(
    `SELECT id, telefono, estado FROM usuario_telefonos WHERE usuario_id = ?`,
    [usuarioId]
  );

  const desiredSet = new Set(desiredUnique);
  for (const row of existing) {
    if (!desiredSet.has(String(row.telefono))) {
      await connection.execute(
        `UPDATE usuario_telefonos
         SET estado = 'inactivo', updated_at_user_id = :actor
         WHERE id = :id`,
        { id: Number(row.id), actor: actorUserId }
      );
    }
  }

  let firstId: number | null = null;
  for (const telefono of desiredUnique) {
    const found = existing.find((r) => String(r.telefono) === telefono);
    if (found) {
      await connection.execute(
        `UPDATE usuario_telefonos
         SET estado = 'activo', updated_at_user_id = :actor
         WHERE id = :id`,
        { id: Number(found.id), actor: actorUserId }
      );
      if (firstId == null) firstId = Number(found.id);
      continue;
    }

    const [owned] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM usuario_telefonos
       WHERE telefono = ? AND usuario_id = ?
       LIMIT 1`,
      [telefono, usuarioId]
    );
    if (owned[0]) {
      await connection.execute(
        `UPDATE usuario_telefonos
         SET estado = 'activo', updated_at_user_id = :actor
         WHERE id = :id`,
        { id: Number(owned[0].id), actor: actorUserId }
      );
      if (firstId == null) firstId = Number(owned[0].id);
      continue;
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO usuario_telefonos
        (usuario_id, telefono, estado, created_at_user_id, updated_at_user_id)
       VALUES
        (:usuario_id, :telefono, 'activo', :actor, :actor)`,
      {
        usuario_id: usuarioId,
        telefono,
        actor: actorUserId,
      }
    );
    if (firstId == null) firstId = result.insertId;
  }

  await connection.execute(
    `UPDATE usuarios SET telefono_id = :telefono_id WHERE id = :id`,
    { id: usuarioId, telefono_id: firstId }
  );

  if (orphans.size && opts?.claimNombreKey) {
    await deleteEmptyUsers(connection, [...orphans], usuarioId);
  }

  return firstId;
}

/** Sincroniza correos: los quitados se inactivan (no se borran). */
async function replaceCorreos(
  connection: PoolConnection,
  usuarioId: number,
  correos: string[],
  actorUserId: number | null,
  opts?: { claimNombreKey?: string }
): Promise<number | null> {
  const orphans = new Set<number>();
  const desiredUnique = [
    ...new Set(correos.map((c) => c.trim().toLowerCase()).filter(Boolean)),
  ];

  for (const correo of desiredUnique) {
    const [dup] = await connection.query<RowDataPacket[]>(
      `SELECT c.id, c.usuario_id, u.nombre
       FROM usuario_correos c
       INNER JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.correo = :correo
       LIMIT 1`,
      { correo }
    );

    if (dup[0] && Number(dup[0].usuario_id) !== usuarioId) {
      const ownerId = Number(dup[0].usuario_id);
      if (
        opts?.claimNombreKey &&
        normalizeNombreKey(String(dup[0].nombre)) === opts.claimNombreKey
      ) {
        await connection.execute(
          `UPDATE usuarios SET correo_id = NULL WHERE id = :id`,
          { id: ownerId }
        );
        await connection.execute(
          `UPDATE usuario_correos
           SET usuario_id = :uid, estado = 'activo', updated_at_user_id = :actor
           WHERE id = :id`,
          { uid: usuarioId, actor: actorUserId, id: Number(dup[0].id) }
        );
        orphans.add(ownerId);
      } else {
        throw new ValidationError(
          `El correo ${correo} ya está registrado en otro usuario.`
        );
      }
    }
  }

  const [existing] = await connection.query<RowDataPacket[]>(
    `SELECT id, correo, estado FROM usuario_correos WHERE usuario_id = ?`,
    [usuarioId]
  );

  const desiredSet = new Set(desiredUnique);
  for (const row of existing) {
    if (!desiredSet.has(String(row.correo))) {
      await connection.execute(
        `UPDATE usuario_correos
         SET estado = 'inactivo', updated_at_user_id = :actor
         WHERE id = :id`,
        { id: Number(row.id), actor: actorUserId }
      );
    }
  }

  let firstId: number | null = null;
  for (const correo of desiredUnique) {
    const found = existing.find((r) => String(r.correo) === correo);
    if (found) {
      await connection.execute(
        `UPDATE usuario_correos
         SET estado = 'activo', updated_at_user_id = :actor
         WHERE id = :id`,
        { id: Number(found.id), actor: actorUserId }
      );
      if (firstId == null) firstId = Number(found.id);
      continue;
    }

    const [owned] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM usuario_correos
       WHERE correo = ? AND usuario_id = ?
       LIMIT 1`,
      [correo, usuarioId]
    );
    if (owned[0]) {
      await connection.execute(
        `UPDATE usuario_correos
         SET estado = 'activo', updated_at_user_id = :actor
         WHERE id = :id`,
        { id: Number(owned[0].id), actor: actorUserId }
      );
      if (firstId == null) firstId = Number(owned[0].id);
      continue;
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO usuario_correos
        (usuario_id, correo, estado, created_at_user_id, updated_at_user_id)
       VALUES
        (:usuario_id, :correo, 'activo', :actor, :actor)`,
      {
        usuario_id: usuarioId,
        correo,
        actor: actorUserId,
      }
    );
    if (firstId == null) firstId = result.insertId;
  }

  await connection.execute(
    `UPDATE usuarios SET correo_id = :correo_id WHERE id = :id`,
    { id: usuarioId, correo_id: firstId }
  );

  if (orphans.size && opts?.claimNombreKey) {
    await deleteEmptyUsers(connection, [...orphans], usuarioId);
  }

  return firstId;
}

const USUARIO_SELECT = `
  u.id, u.nombre, u.correo_id, u.telefono_id, u.fecha_registro, u.estado,
  u.created_at, u.updated_at, u.created_at_user_id, u.updated_at_user_id
`;

export async function listUsuarios(
  filters: UsuarioFilters = {}
): Promise<PaginatedUsuarios> {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 10));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.q?.trim()) {
    where.push(
      `(u.nombre LIKE :q
        OR EXISTS (
          SELECT 1 FROM usuario_telefonos t
          WHERE t.usuario_id = u.id AND t.estado = 'activo' AND t.telefono LIKE :q
        )
        OR EXISTS (
          SELECT 1 FROM usuario_correos c
          WHERE c.usuario_id = u.id AND c.estado = 'activo' AND c.correo LIKE :q
        ))`
    );
    params.q = `%${filters.q.trim()}%`;
  }

  if (filters.estado === "activo" || filters.estado === "inactivo") {
    where.push(`u.estado = :estado`);
    params.estado = filters.estado;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pool = getPool();

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM usuarios u ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.query<UsuarioRow[]>(
    `SELECT ${USUARIO_SELECT}
     FROM usuarios u
     ${whereSql}
     ORDER BY u.fecha_registro DESC, u.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const ids = rows.map((r) => r.id);
  const [telefonosMap, correosMap] = await Promise.all([
    loadTelefonos(ids),
    loadCorreos(ids),
  ]);

  return {
    data: rows.map((row) =>
      mapUsuario(
        row,
        correosMap.get(row.id) ?? [],
        telefonosMap.get(row.id) ?? []
      )
    ),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getUsuarioById(id: number): Promise<Usuario | null> {
  const pool = getPool();
  const [rows] = await pool.query<UsuarioRow[]>(
    `SELECT ${USUARIO_SELECT}
     FROM usuarios u
     WHERE u.id = :id
     LIMIT 1`,
    { id }
  );
  if (!rows[0]) return null;
  const [telefonosMap, correosMap] = await Promise.all([
    loadTelefonos([id]),
    loadCorreos([id]),
  ]);
  return mapUsuario(
    rows[0],
    correosMap.get(id) ?? [],
    telefonosMap.get(id) ?? []
  );
}

export async function createUsuario(input: UsuarioInput): Promise<Usuario> {
  const data = sanitizeUsuarioInput(input);
  data.estado = "activo";
  const error = validateUsuarioInput(data);
  if (error) throw new ValidationError(error);

  const actorPref = data.actor_user_id ?? null;
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1) Usuario sin referencias aún
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO usuarios
        (nombre, correo_id, telefono_id, estado, created_at_user_id, updated_at_user_id)
       VALUES
        (:nombre, NULL, NULL, 'activo', :actor, :actor)`,
      { nombre: data.nombre, actor: actorPref }
    );

    const usuarioId = result.insertId;
    // Si no hay operador, la auditoría usa el id del propio usuario
    const actor = actorPref ?? usuarioId;
    if (actorPref == null) {
      await connection.execute(
        `UPDATE usuarios
         SET created_at_user_id = :actor, updated_at_user_id = :actor
         WHERE id = :id`,
        { id: usuarioId, actor }
      );
    }

    // 2) Correos y teléfonos → 3) actualizar IDs de referencia
    await replaceCorreos(connection, usuarioId, data.correos, actor);
    await replaceTelefonos(connection, usuarioId, data.telefonos, actor);

    await connection.commit();

    const created = await getUsuarioById(usuarioId);
    if (!created) throw new Error("No se pudo recuperar el usuario creado.");
    return created;
  } catch (err) {
    await connection.rollback();
    throw mapDbError(err);
  } finally {
    connection.release();
  }
}

export async function updateUsuario(
  id: number,
  input: Partial<UsuarioInput>
): Promise<Usuario> {
  const existing = await getUsuarioById(id);
  if (!existing) throw new NotFoundError("Usuario no encontrado.");

  const merged: UsuarioInput = {
    nombre: input.nombre ?? existing.nombre,
    correos: input.correos ?? existing.correos.map((c) => c.correo),
    telefonos: input.telefonos ?? existing.telefonos,
    estado: input.estado ?? existing.estado,
    actor_user_id: input.actor_user_id,
  };

  const data = sanitizeUsuarioInput(merged);
  const error = validateUsuarioInput(data);
  if (error) throw new ValidationError(error);

  const actor = data.actor_user_id ?? id;
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE usuarios
       SET nombre = :nombre,
           estado = :estado,
           updated_at_user_id = :actor
       WHERE id = :id`,
      {
        id,
        nombre: data.nombre,
        estado: data.estado ?? existing.estado,
        actor,
      }
    );

    await replaceCorreos(connection, id, data.correos, actor);
    await replaceTelefonos(connection, id, data.telefonos, actor);
    await connection.commit();

    const updated = await getUsuarioById(id);
    if (!updated) throw new Error("No se pudo recuperar el usuario actualizado.");
    return updated;
  } catch (err) {
    await connection.rollback();
    throw mapDbError(err);
  } finally {
    connection.release();
  }
}

/** Baja lógica: inactiva el registro (no lo borra). */
export async function deleteUsuario(
  id: number,
  actorUserId: number | null = null
): Promise<Usuario> {
  const existing = await getUsuarioById(id);
  if (!existing) throw new NotFoundError("Usuario no encontrado.");

  const actor = actorUserId ?? id;
  const pool = getPool();
  await pool.execute(
    `UPDATE usuarios
     SET estado = 'inactivo', updated_at_user_id = :actor
     WHERE id = :id`,
    { id, actor }
  );

  const updated = await getUsuarioById(id);
  if (!updated) throw new NotFoundError("Usuario no encontrado.");
  return updated;
}

function importRowLabel(raw: {
  nombre?: string;
  correo?: string;
  telefono?: string;
  telefonos?: string;
}): string {
  const parts = [
    raw.nombre?.trim(),
    raw.correo?.trim(),
    String(raw.telefono || raw.telefonos || "")
      .trim()
      .split(/[|;]/)[0]
      ?.trim(),
  ].filter(Boolean);
  return parts.join(" · ") || "(sin datos)";
}

function normalizeNombreKey(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u200b\uFEFF]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

type ImportRawRow = Partial<{
  nombre: string;
  correo: string;
  correos?: string;
  telefono?: string;
  telefonos?: string;
  codigo_pais?: string;
}>;

type ImportGroup = {
  key: string;
  nombre: string;
  rowNumbers: number[];
  emailSources: string[];
  phoneSources: string[];
  defaultCodigo: string;
  label: string;
};

function collectEmails(raw: ImportRawRow): string[] {
  return [
    ...(raw.correos ? String(raw.correos).split(/[|;,]/) : []),
    ...(raw.correo ? [String(raw.correo)] : []),
  ]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function collectPhones(raw: ImportRawRow): string[] {
  return [
    ...(raw.telefonos ? String(raw.telefonos).split(/[|;]/) : []),
    ...(raw.telefono ? [String(raw.telefono)] : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Agrupa filas con el mismo nombre (misma persona) y fusiona correos/teléfonos. */
function groupImportRows(rows: ImportRawRow[]): ImportGroup[] {
  const map = new Map<string, ImportGroup>();
  const order: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNumber = i + 2;
    const nombre = String(raw.nombre ?? "").trim();
    const key = nombre ? normalizeNombreKey(nombre) : `__fila_${rowNumber}`;

    let group = map.get(key);
    if (!group) {
      group = {
        key,
        nombre: nombre || `(sin nombre fila ${rowNumber})`,
        rowNumbers: [],
        emailSources: [],
        phoneSources: [],
        defaultCodigo: String(raw.codigo_pais || "502"),
        label: importRowLabel(raw),
      };
      map.set(key, group);
      order.push(key);
    }

    group.rowNumbers.push(rowNumber);
    group.emailSources.push(...collectEmails(raw));
    group.phoneSources.push(...collectPhones(raw));
    if (!group.nombre || group.nombre.startsWith("(sin nombre")) {
      if (nombre) group.nombre = nombre;
    }
    if (raw.nombre?.trim()) group.nombre = raw.nombre.trim();
  }

  return order.map((k) => map.get(k)!);
}

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const v = e.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function uniquePhones(
  sources: string[],
  defaultCodigo: string
): { telefonos: { telefono: string }[]; parseErrors: string[] } {
  const seen = new Set<string>();
  const telefonos: { telefono: string }[] = [];
  const parseErrors: string[] = [];

  for (const src of sources) {
    const parsed = parseTelefonoFlexible(src, defaultCodigo as "502");
    if (!parsed) {
      parseErrors.push(`Teléfono inválido: "${src}"`);
      continue;
    }
    if (seen.has(parsed.telefono)) continue;
    seen.add(parsed.telefono);
    telefonos.push({ telefono: parsed.telefono });
  }

  return { telefonos, parseErrors };
}

async function queryInChunks<T extends RowDataPacket>(
  connection: PoolConnection,
  values: string[],
  buildSql: (placeholders: string) => string
): Promise<T[]> {
  if (!values.length) return [];
  const out: T[] = [];
  const chunkSize = 400;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    const [rows] = await connection.query<T[]>(buildSql(placeholders), chunk);
    out.push(...rows);
  }
  return out;
}

function dedupeUsersById(
  rows: Array<{ id: number | string; nombre: string } | RowDataPacket>
): { id: number; nombre: string }[] {
  const map = new Map<number, { id: number; nombre: string }>();
  for (const row of rows) {
    const id = Number((row as { id: number | string }).id);
    const nombre = String((row as { nombre: string }).nombre ?? "");
    if (!Number.isFinite(id) || map.has(id)) continue;
    map.set(id, { id, nombre });
  }
  return [...map.values()];
}

/**
 * Absorbe usuarios duplicados (mismo nombre) en el canónico:
 * mueve correos/teléfonos y elimina los registros sobrantes.
 */
async function absorbDuplicateUsuarios(
  connection: PoolConnection,
  canonicalId: number,
  duplicateIds: number[],
  actorUserId: number | null
): Promise<void> {
  const others = [...new Set(duplicateIds)].filter((id) => id !== canonicalId);
  if (!others.length) return;

  const allIds = [canonicalId, ...others];
  await connection.execute(
    `UPDATE usuarios SET correo_id = NULL, telefono_id = NULL
     WHERE id IN (${allIds.map(() => "?").join(", ")})`,
    allIds
  );

  for (const oid of others) {
    await connection.execute(
      `DELETE c FROM usuario_correos c
       INNER JOIN usuario_correos c2
         ON c2.correo = c.correo AND c2.usuario_id = ?
       WHERE c.usuario_id = ?`,
      [canonicalId, oid]
    );
    await connection.execute(
      `UPDATE usuario_correos
       SET usuario_id = ?, updated_at_user_id = ?
       WHERE usuario_id = ?`,
      [canonicalId, actorUserId, oid]
    );

    await connection.execute(
      `DELETE t FROM usuario_telefonos t
       INNER JOIN usuario_telefonos t2
         ON t2.telefono = t.telefono AND t2.usuario_id = ?
       WHERE t.usuario_id = ?`,
      [canonicalId, oid]
    );
    await connection.execute(
      `UPDATE usuario_telefonos
       SET usuario_id = ?, updated_at_user_id = ?
       WHERE usuario_id = ?`,
      [canonicalId, actorUserId, oid]
    );
  }

  await connection.execute(
    `DELETE FROM usuarios WHERE id IN (${others.map(() => "?").join(", ")})`,
    others
  );
}

export async function importUsuarios(
  rows: ImportRawRow[],
  actorUserId: number | null = null
): Promise<ImportResult> {
  const result: ImportResult = {
    inserted: 0,
    updated: 0,
    errors: [],
    total: rows.length,
    success: 0,
  };
  const pool = getPool();
  const groups = groupImportRows(rows);

  for (const group of groups) {
    const connection = await pool.getConnection();
    const rowRef = group.rowNumbers[0];
    const filasLabel =
      group.rowNumbers.length > 1
        ? `Filas ${group.rowNumbers.join(", ")}`
        : `Fila ${rowRef}`;

    try {
      await connection.beginTransaction();

      const emails = uniqueEmails(group.emailSources);
      const { telefonos, parseErrors } = uniquePhones(
        group.phoneSources,
        group.defaultCodigo
      );

      if (parseErrors.length) {
        await connection.rollback();
        result.errors.push({
          row: rowRef,
          message: `${filasLabel}: ${parseErrors[0]}`,
          data: group.nombre,
        });
        continue;
      }

      const data = sanitizeUsuarioInput({
        nombre: group.nombre,
        correos: emails,
        telefonos,
        estado: "activo",
        actor_user_id: actorUserId,
      });
      const error = validateUsuarioInput(data);
      if (error) {
        await connection.rollback();
        result.errors.push({
          row: rowRef,
          message: `${filasLabel}: ${error}`,
          data: group.nombre,
        });
        continue;
      }

      const nameKey = normalizeNombreKey(data.nombre);
      const phones = data.telefonos.map((t) => t.telefono);

      const byEmail = dedupeUsersById(
        await queryInChunks(connection, data.correos, (ph) =>
          `SELECT DISTINCT u.id, u.nombre
           FROM usuarios u
           INNER JOIN usuario_correos c ON c.usuario_id = u.id
           WHERE c.correo IN (${ph})`
        )
      );

      const byPhone = dedupeUsersById(
        await queryInChunks(connection, phones, (ph) =>
          `SELECT DISTINCT u.id, u.nombre
           FROM usuarios u
           INNER JOIN usuario_telefonos t ON t.usuario_id = u.id
           WHERE t.telefono IN (${ph})`
        )
      );

      const [byNameRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, nombre FROM usuarios
         WHERE LOWER(TRIM(nombre)) = :exact
            OR LOWER(TRIM(nombre)) = :key
         ORDER BY id ASC`,
        {
          exact: data.nombre.trim().toLowerCase(),
          key: nameKey,
        }
      );
      const byName = dedupeUsersById(
        byNameRows.filter(
          (r) => normalizeNombreKey(String(r.nombre)) === nameKey
        ) as { id: number; nombre: string }[]
      );

      const related = dedupeUsersById([...byEmail, ...byPhone, ...byName]);

      // Contactos que pertenecen a otra persona (nombre distinto) → conflicto real
      const foreign = related.filter(
        (u) => normalizeNombreKey(u.nombre) !== nameKey
      );
      if (foreign.length) {
        await connection.rollback();
        result.errors.push({
          row: rowRef,
          message: `${filasLabel}: un correo o teléfono ya pertenece a otra persona (${foreign[0].nombre}).`,
          data: group.nombre,
        });
        continue;
      }

      const samePersonIds = related.map((u) => u.id);
      let usuarioId: number | null =
        samePersonIds.length > 0 ? Math.min(...samePersonIds) : null;

      if (usuarioId != null) {
        const actor = actorUserId ?? usuarioId;
        // Une todos los "Luis Ramirez" previos en un solo registro
        await absorbDuplicateUsuarios(
          connection,
          usuarioId,
          samePersonIds,
          actor
        );

        const [existingCorreos] = await connection.query<RowDataPacket[]>(
          `SELECT correo FROM usuario_correos WHERE usuario_id = ?`,
          [usuarioId]
        );
        const [existingTelefonos] = await connection.query<RowDataPacket[]>(
          `SELECT telefono FROM usuario_telefonos WHERE usuario_id = ?`,
          [usuarioId]
        );

        const mergedEmails = uniqueEmails([
          ...existingCorreos.map((c) => String(c.correo)),
          ...data.correos,
        ]);
        const mergedPhonesMap = new Map<string, { telefono: string }>();
        for (const t of [
          ...existingTelefonos.map((t) => ({
            telefono: String(t.telefono),
          })),
          ...data.telefonos,
        ]) {
          const n = normalizeTelefonoValue(t.telefono);
          if (n) mergedPhonesMap.set(n, { telefono: n });
        }
        const mergedPhones = [...mergedPhonesMap.values()];

        await connection.execute(
          `UPDATE usuarios
           SET nombre = :nombre,
               estado = 'activo',
               updated_at_user_id = :actor
           WHERE id = :id`,
          {
            id: usuarioId,
            nombre: data.nombre,
            actor,
          }
        );
        await replaceCorreos(connection, usuarioId, mergedEmails, actor, {
          claimNombreKey: nameKey,
        });
        await replaceTelefonos(
          connection,
          usuarioId,
          mergedPhones,
          actor,
          { claimNombreKey: nameKey }
        );
        result.updated += 1;
      } else {
        const [insertResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO usuarios
            (nombre, correo_id, telefono_id, estado, created_at_user_id, updated_at_user_id)
           VALUES
            (:nombre, NULL, NULL, 'activo', :actor, :actor)`,
          { nombre: data.nombre, actor: actorUserId }
        );
        const newId = insertResult.insertId;
        const actor = actorUserId ?? newId;
        if (actorUserId == null) {
          await connection.execute(
            `UPDATE usuarios
             SET created_at_user_id = :actor, updated_at_user_id = :actor
             WHERE id = :id`,
            { id: newId, actor }
          );
        }
        await replaceCorreos(
          connection,
          newId,
          data.correos,
          actor,
          { claimNombreKey: nameKey }
        );
        await replaceTelefonos(
          connection,
          newId,
          data.telefonos,
          actor,
          { claimNombreKey: nameKey }
        );
        result.inserted += 1;
      }

      await connection.commit();
      result.success += group.rowNumbers.length;
    } catch (err) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      const mapped = mapDbError(err);
      result.errors.push({
        row: rowRef,
        message: `${filasLabel}: ${mapped.message}`,
        data: group.nombre,
      });
    } finally {
      connection.release();
    }
  }

  return result;
}

function mapDbError(err: unknown): Error {
  if (err instanceof ValidationError || err instanceof NotFoundError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Duplicate") || message.includes("ER_DUP_ENTRY")) {
    if (message.includes("uk_telefono")) {
      return new ValidationError(
        "Ese número de teléfono ya está registrado en otro usuario."
      );
    }
    if (message.includes("uk_correo") || message.includes("correo")) {
      return new ValidationError("Ya existe un usuario con ese correo.");
    }
    return new ValidationError("Registro duplicado.");
  }
  return err instanceof Error ? err : new Error(message);
}

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
