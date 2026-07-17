import type { UsuarioInput } from "./types";
import {
  normalizeTelefonoValue,
  validateTelefonosList,
} from "./phones";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCorreos(correos: string[]): string | null {
  if (!correos.length) return "Debes agregar al menos un correo.";

  const seen = new Set<string>();
  for (const raw of correos) {
    const correo = String(raw ?? "").trim().toLowerCase();
    if (!correo) return "Hay un correo vacío.";
    if (!EMAIL_RE.test(correo)) return `El correo "${correo}" no es válido.`;
    if (correo.length > 180) {
      return "Un correo no puede superar 180 caracteres.";
    }
    if (seen.has(correo)) {
      return "Hay correos duplicados en el mismo usuario.";
    }
    seen.add(correo);
  }
  return null;
}

export function validateUsuarioInput(
  input: Partial<UsuarioInput>,
  { partial = false }: { partial?: boolean } = {}
): string | null {
  if (!partial || input.nombre !== undefined) {
    if (!input.nombre?.trim()) return "El nombre es obligatorio.";
    if (input.nombre.trim().length > 150) {
      return "El nombre no puede superar 150 caracteres.";
    }
  }

  if (!partial || input.correos !== undefined) {
    const emailError = validateCorreos(input.correos ?? []);
    if (emailError) return emailError;
  }

  if (!partial || input.telefonos !== undefined) {
    const phoneError = validateTelefonosList(input.telefonos ?? []);
    if (phoneError) return phoneError;
  }

  if (input.estado !== undefined && input.estado !== null) {
    if (input.estado !== "activo" && input.estado !== "inactivo") {
      return "El estado debe ser 'activo' o 'inactivo'.";
    }
  }

  return null;
}

export function sanitizeUsuarioInput(input: Partial<UsuarioInput>): UsuarioInput {
  const correos = (input.correos ?? [])
    .map((c) => String(c ?? "").trim().toLowerCase())
    .filter(Boolean);

  const telefonos = (input.telefonos ?? [])
    .map((t) => ({
      ...t,
      telefono: normalizeTelefonoValue(t.telefono ?? ""),
    }))
    .filter((t) => t.telefono.length > 1);

  return {
    nombre: String(input.nombre ?? "").trim(),
    correos,
    telefonos,
    estado: input.estado === "inactivo" ? "inactivo" : "activo",
    actor_user_id:
      input.actor_user_id != null && Number(input.actor_user_id) > 0
        ? Number(input.actor_user_id)
        : null,
  };
}
