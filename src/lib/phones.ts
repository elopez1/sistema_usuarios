
export type CodigoPaisCA =
  | "501"
  | "502"
  | "503"
  | "504"
  | "505"
  | "506"
  | "507";

export interface PaisTelefono {
  codigo: CodigoPaisCA;
  nombre: string;
  digitos: number;
}

export const PAISES_CA: PaisTelefono[] = [
  { codigo: "502", nombre: "Guatemala", digitos: 8 },
  { codigo: "501", nombre: "Belice", digitos: 7 },
  { codigo: "503", nombre: "El Salvador", digitos: 8 },
  { codigo: "504", nombre: "Honduras", digitos: 8 },
  { codigo: "505", nombre: "Nicaragua", digitos: 8 },
  { codigo: "506", nombre: "Costa Rica", digitos: 8 },
  { codigo: "507", nombre: "Panamá", digitos: 8 },
];

export const DEFAULT_CODIGO_PAIS: CodigoPaisCA = "502";

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatTelefonoE164(value: string): string {
  const digits = onlyDigits(value);
  return digits ? `+${digits}` : "";
}


export function parseTelefonoFlexible(
  raw: string,
  defaultCodigo: CodigoPaisCA = DEFAULT_CODIGO_PAIS
): { telefono: string } | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  let digits = onlyDigits(trimmed);

  // Código CA duplicado: 502502XXXXXXXX → 502 + XXXXXXXX
  for (const p of PAISES_CA) {
    const doubled = p.codigo + p.codigo;
    if (
      digits.startsWith(doubled) &&
      digits.length === doubled.length + p.digitos
    ) {
      digits = p.codigo + digits.slice(doubled.length);
      break;
    }
  }

  for (const p of PAISES_CA) {
    if (
      digits.startsWith(p.codigo) &&
      digits.length === p.codigo.length + p.digitos
    ) {
      return { telefono: `+${digits}` };
    }
  }

  const def = PAISES_CA.find((p) => p.codigo === defaultCodigo)!;
  if (digits.length === def.digitos) {
    return { telefono: `+${defaultCodigo}${digits}` };
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return { telefono: `+${digits}` };
  }

  return null;
}

export function validateTelefonoValue(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "El teléfono es obligatorio.";

  const parsed = parseTelefonoFlexible(trimmed);
  if (!parsed) {
    return "Teléfono no válido. Usa formato +50241234567 o 8 dígitos (Guatemala).";
  }

  const digits = onlyDigits(parsed.telefono);

  for (const p of PAISES_CA) {
    if (digits.startsWith(p.codigo)) {
      const local = digits.slice(p.codigo.length);
      if (local.length !== p.digitos) {
        return `${p.nombre} (+${p.codigo}) requiere exactamente ${p.digitos} dígitos locales (ej. +${p.codigo}${"1".repeat(p.digitos)}).`;
      }
      return null;
    }
  }

  if (digits.length < 8 || digits.length > 15) {
    return "El teléfono internacional debe tener entre 8 y 15 dígitos.";
  }
  return null;
}

export function validateTelefonosList(
  telefonos: { telefono: string }[]
): string | null {
  if (!telefonos.length) return "Debes agregar al menos un teléfono.";

  const seen = new Set<string>();
  for (const tel of telefonos) {
    const err = validateTelefonoValue(tel.telefono);
    if (err) return err;

    const key = formatTelefonoE164(tel.telefono);
    if (seen.has(key)) {
      return "Hay teléfonos duplicados en el mismo usuario.";
    }
    seen.add(key);
  }
  return null;
}

export function normalizeTelefonoValue(raw: string): string {
  const parsed = parseTelefonoFlexible(raw);
  return parsed?.telefono ?? formatTelefonoE164(raw);
}
export type CodigoForm = CodigoPaisCA | "otro";

export function getPaisByCodigo(codigo: string): PaisTelefono | undefined {
  return PAISES_CA.find((p) => p.codigo === codigo);
}

export function splitTelefonoUI(raw: string): {
  codigo: CodigoForm;
  local: string;
} {
  const trimmed = String(raw ?? "").trim();
  const digits = onlyDigits(raw);

  // Solo "+" = país "Otro" sin dígitos aún (crear usuario vacío).
  if (!digits) {
    if (trimmed === "+") {
      return { codigo: "otro", local: "" };
    }
    return { codigo: DEFAULT_CODIGO_PAIS, local: "" };
  }

  for (const p of PAISES_CA) {
    if (!digits.startsWith(p.codigo)) continue;
    const local = digits.slice(p.codigo.length);
    if (local.length <= p.digitos) {
      return { codigo: p.codigo, local };
    }
  }

  const def = getPaisByCodigo(DEFAULT_CODIGO_PAIS)!;
  if (digits.length <= def.digitos && !trimmed.startsWith("+")) {
    return { codigo: DEFAULT_CODIGO_PAIS, local: digits };
  }

  return { codigo: "otro", local: digits };
}

export function joinTelefonoUI(codigo: CodigoForm, local: string): string {
  const digits = onlyDigits(local);
  if (codigo === "otro") {
    // Conservar selección aunque el local esté vacío (antes se perdía al crear).
    return digits ? `+${digits}` : "+";
  }
  const pais = getPaisByCodigo(codigo);
  const max = pais?.digitos ?? 8;
  const localPart = digits.slice(0, max);
  // Guardar +código aunque aún no haya dígitos locales, para que el select
  // de país no vuelva a Guatemala/8 al crear un usuario nuevo.
  return `+${codigo}${localPart}`;
}
