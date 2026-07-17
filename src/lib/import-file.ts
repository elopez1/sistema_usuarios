

import * as XLSX from "xlsx";

const HEADER_ALIASES: Record<string, string> = {
  nombre: "nombre",
  name: "nombre",
  nombres: "nombre",
  correo: "correo",
  email: "correo",
  mail: "correo",
  e_mail: "correo",
  correos: "correos",
  emails: "correos",
  telefono: "telefono",
  telefonos: "telefonos",
  phone: "telefono",
  phones: "telefonos",
  tel: "telefono",
  celular: "telefono",
  movil: "telefono",
  codigo_pais: "codigo_pais",
  codigopais: "codigo_pais",
  pais: "codigo_pais",
  country: "codigo_pais",
  country_code: "codigo_pais",
  countrycode: "codigo_pais",
  estado: "estado",
  status: "estado",
};

export function normalizeHeaderKey(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function mapHeaderKey(raw: string): string | null {
  const normalized = normalizeHeaderKey(raw);
  if (!normalized) return null;
  return HEADER_ALIASES[normalized] ?? normalized;
}

export type ImportRow = Record<string, string>;

function mapRowKeys(row: Record<string, unknown>): ImportRow {
  const mapped: ImportRow = {};
  for (const [key, value] of Object.entries(row)) {
    const mappedKey = mapHeaderKey(key);
    if (!mappedKey) continue;
    const str =
      value == null || value === undefined ? "" : String(value).trim();
    if (mapped[mappedKey] && str) {
      mapped[mappedKey] = `${mapped[mappedKey]}|${str}`;
    } else if (!mapped[mappedKey]) {
      mapped[mappedKey] = str;
    }
  }
  return mapped;
}

export function parseCsv(content: string): ImportRow[] {
  const lines = splitCsvLines(content.replace(/^\uFEFF/, "").trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => mapHeaderKey(h));

  return lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const values = parseCsvLine(line);
      const row: ImportRow = {};
      headers.forEach((key, idx) => {
        if (!key) return;
        const value = (values[idx] ?? "").trim();
        if (row[key] && value) row[key] = `${row[key]}|${value}`;
        else if (!row[key]) row[key] = value;
      });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v.trim() !== ""));
}

export function parseXlsx(buffer: ArrayBuffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return rawRows
    .map((row) => mapRowKeys(row))
    .filter((row) => Object.values(row).some((v) => v.trim() !== ""));
}

export async function parseImportFile(file: File): Promise<ImportRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    return parseCsv(text);
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  ) {
    const buffer = await file.arrayBuffer();
    return parseXlsx(buffer);
  }

  throw new Error("Formato no soportado. Usa un archivo .csv o .xlsx");
}

function splitCsvLines(content: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }

    if ((ch === "\n" || (ch === "\r" && next === "\n")) && !inQuotes) {
      if (ch === "\r") i += 1;
      if (current.trim()) lines.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) lines.push(current);
  return lines;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}
