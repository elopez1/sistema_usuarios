import mysql, { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var mysqlPool: Pool | undefined;
}

function createPool(): Pool {
  return mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "sistema_usuarios",
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    dateStrings: true,
  });
}

export function getPool(): Pool {
  if (!global.mysqlPool) {
    global.mysqlPool = createPool();
  }
  return global.mysqlPool;
}

export type { ResultSetHeader, RowDataPacket };
