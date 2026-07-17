import mysql from "mysql2/promise";

const PAISES = {
  501: 7,
  502: 8,
  503: 8,
  504: 8,
  505: 8,
  506: 8,
  507: 8,
};

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function parsePhone(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  const withPlus = trimmed.match(/^\+(\d{3})(\d+)$/);
  if (withPlus) return { codigo: withPlus[1], numero: withPlus[2] };
  const digits = onlyDigits(trimmed);
  if (digits.length === 8) return { codigo: "502", numero: digits };
  for (const codigo of Object.keys(PAISES)) {
    const digitos = PAISES[codigo];
    if (
      digits.startsWith(codigo) &&
      digits.length === codigo.length + digitos
    ) {
      return { codigo, numero: digits.slice(codigo.length) };
    }
  }
  return { codigo: "502", numero: digits };
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 8889),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "sistema_usuarios",
});

const [users] = await conn.query(
  `SELECT u.id, u.telefono
   FROM usuarios u
   WHERE TRIM(u.telefono) <> ''
     AND NOT EXISTS (
       SELECT 1 FROM usuario_telefonos t WHERE t.usuario_id = u.id
     )`
);

let migrated = 0;
for (const user of users) {
  const parsed = parsePhone(user.telefono);
  if (!parsed?.numero) continue;
  try {
    await conn.execute(
      `INSERT IGNORE INTO usuario_telefonos (usuario_id, codigo_pais, numero, es_principal)
       VALUES (?, ?, ?, 1)`,
      [user.id, parsed.codigo, onlyDigits(parsed.numero)]
    );
    await conn.execute(`UPDATE usuarios SET telefono = ? WHERE id = ?`, [
      `+${parsed.codigo}${onlyDigits(parsed.numero)}`,
      user.id,
    ]);
    migrated += 1;
  } catch (err) {
    console.warn(`Usuario ${user.id}:`, err.message);
  }
}

console.log(`Migrados: ${migrated}`);
await conn.end();
