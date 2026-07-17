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
  created_at: string;
  updated_at: string;
  created_at_user_id: number | null;
  updated_at_user_id: number | null;
};

type CorreoRow = RowDataPacket & {
  id: number;
  usuario_id: number;
  correo: string;
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
    `SELECT id, usuario_id, telefono,
            created_at, updated_at, created_at_user_id, updated_at_user_id
     FROM usuario_telefonos
     WHERE usuario_id IN (${placeholders})
     ORDER BY id ASC`,
    usuarioIds
  );

  for (const row of rows) {
    const list = map.get(row.usuario_id) ?? [];
    list.push({
      id: row.id,
      telefono: row.telefono,
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
    `SELECT id, usuario_id, correo,
            created_at, updated_at, created_at_user_id, updated_at_user_id
     FROM usuario_correos
     WHERE usuario_id IN (${placeholders})
     ORDER BY id ASC`,
    usuarioIds
  );

  for (const row of rows) {
    const list = map.get(row.usuario_id) ?? [];
    list.push({
      id: row.id,
      correo: row.correo,
      ...auditFromRow(row),
    });
    map.set(row.usuario_id, list);
  }

  return map;
}

function resolveCorreo(
  correoId: number | null,
  correos: CorreoUsuario[]
): string {
  if (correoId != null) {
    const found = correos.find((c) => c.id === correoId);
    if (found) return found.correo;
  }
  return correos[0]?.correo ?? "";
}

function resolveTelefono(
  telefonoId: number | null,
  telefonos: TelefonoUsuario[]
): string {
  if (telefonoId != null) {
    const found = telefonos.find((t) => t.id === telefonoId);
    if (found) return found.telefono;
  }
  return telefonos[0]?.telefono ?? "";
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

/** Reemplaza teléfonos y actualiza usuarios.telefono_id al primero. */
async function replaceTelefonos(
  connection: PoolConnection,
  usuarioId: number,
  telefonos: TelefonoUsuario[],
  actorUserId: number | null
): Promise<number | null> {
  for (const tel of telefonos) {
    const telefono = normalizeTelefonoValue(tel.telefono);
    const [dup] = await connection.query<RowDataPacket[]>(
      `SELECT id, usuario_id FROM usuario_telefonos
       WHERE telefono = :telefono
       LIMIT 1`,
      { telefono }
    );

    if (dup[0] && Number(dup[0].usuario_id) !== usuarioId) {
      throw new ValidationError(
        `El teléfono ${telefono} ya está registrado en otro usuario.`
      );
    }
  }

  // Liberar FK antes de borrar
  await connection.execute(
    `UPDATE usuarios SET telefono_id = NULL WHERE id = :id`,
    { id: usuarioId }
  );

  await connection.execute(
    `DELETE FROM usuario_telefonos WHERE usuario_id = :usuario_id`,
    { usuario_id: usuarioId }
  );

  let firstId: number | null = null;

  for (const tel of telefonos) {
    const telefono = normalizeTelefonoValue(tel.telefono);
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO usuario_telefonos
        (usuario_id, telefono, created_at_user_id, updated_at_user_id)
       VALUES
        (:usuario_id, :telefono, :actor, :actor)`,
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

  return firstId;
}

/** Reemplaza correos y actualiza usuarios.correo_id al primero. */
async function replaceCorreos(
  connection: PoolConnection,
  usuarioId: number,
  correos: string[],
  actorUserId: number | null
): Promise<number | null> {
  for (const correo of correos) {
    const [dup] = await connection.query<RowDataPacket[]>(
      `SELECT id, usuario_id FROM usuario_correos
       WHERE correo = :correo
       LIMIT 1`,
      { correo }
    );

    if (dup[0] && Number(dup[0].usuario_id) !== usuarioId) {
      throw new ValidationError(
        `El correo ${correo} ya está registrado en otro usuario.`
      );
    }
  }

  await connection.execute(
    `UPDATE usuarios SET correo_id = NULL WHERE id = :id`,
    { id: usuarioId }
  );

  await connection.execute(
    `DELETE FROM usuario_correos WHERE usuario_id = :usuario_id`,
    { usuario_id: usuarioId }
  );

  let firstId: number | null = null;

  for (const correo of correos) {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO usuario_correos
        (usuario_id, correo, created_at_user_id, updated_at_user_id)
       VALUES
        (:usuario_id, :correo, :actor, :actor)`,
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
          WHERE t.usuario_id = u.id AND t.telefono LIKE :q
        )
        OR EXISTS (
          SELECT 1 FROM usuario_correos c
          WHERE c.usuario_id = u.id AND c.correo LIKE :q
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

  const actor = data.actor_user_id ?? null;
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
      { nombre: data.nombre, actor }
    );

    const usuarioId = result.insertId;

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

  const actor = data.actor_user_id ?? null;
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

  const pool = getPool();
  await pool.execute(
    `UPDATE usuarios
     SET estado = 'inactivo', updated_at_user_id = :actor
     WHERE id = :id`,
    { id, actor: actorUserId }
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

export async function importUsuarios(
  rows: Partial<{
    nombre: string;
    correo: string;
    correos?: string;
    telefono?: string;
    telefonos?: string;
    codigo_pais?: string;
  }>[],
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

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2;
    const raw = rows[i];
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const emailSources = [
        ...(raw.correos ? String(raw.correos).split(/[|;,]/) : []),
        ...(raw.correo ? [String(raw.correo)] : []),
      ]
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const phoneSources = [
        ...(raw.telefonos ? String(raw.telefonos).split(/[|;]/) : []),
        ...(raw.telefono ? [String(raw.telefono)] : []),
      ]
        .map((s) => s.trim())
        .filter(Boolean);

      const defaultCodigo =
        (raw.codigo_pais as "502") || "502";

      const telefonos = phoneSources
        .map((src) => {
          const parsed = parseTelefonoFlexible(src, defaultCodigo);
          return parsed ? { telefono: parsed.telefono } : null;
        })
        .filter((t): t is NonNullable<typeof t> => Boolean(t));

      const data = sanitizeUsuarioInput({
        nombre: raw.nombre,
        correos: emailSources,
        telefonos,
        estado: "activo",
        actor_user_id: actorUserId,
      });
      const error = validateUsuarioInput(data);
      if (error) {
        await connection.rollback();
        result.errors.push({
          row: rowNumber,
          message: error,
          data: importRowLabel(raw),
        });
        continue;
      }

      const [existing] = await connection.query<RowDataPacket[]>(
        `SELECT u.id
         FROM usuarios u
         WHERE EXISTS (
           SELECT 1 FROM usuario_correos c
           WHERE c.usuario_id = u.id
             AND c.correo IN (${data.correos.map(() => "?").join(", ")})
         )
         LIMIT 1`,
        data.correos
      );

      if (existing[0]) {
        const usuarioId = Number(existing[0].id);
        await connection.execute(
          `UPDATE usuarios
           SET nombre = :nombre,
               estado = 'activo',
               updated_at_user_id = :actor
           WHERE id = :id`,
          {
            id: usuarioId,
            nombre: data.nombre,
            actor: actorUserId,
          }
        );
        await replaceCorreos(connection, usuarioId, data.correos, actorUserId);
        await replaceTelefonos(
          connection,
          usuarioId,
          data.telefonos,
          actorUserId
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
        await replaceCorreos(
          connection,
          insertResult.insertId,
          data.correos,
          actorUserId
        );
        await replaceTelefonos(
          connection,
          insertResult.insertId,
          data.telefonos,
          actorUserId
        );
        result.inserted += 1;
      }

      await connection.commit();
      result.success += 1;
    } catch (err) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      const mapped = mapDbError(err);
      result.errors.push({
        row: rowNumber,
        message: mapped.message,
        data: importRowLabel(raw),
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
