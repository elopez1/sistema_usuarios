export type EstadoUsuario = "activo" | "inactivo";
export type EstadoContacto = "activo" | "inactivo";

export interface AuditFields {
  created_at: string;
  updated_at: string;
  created_at_user_id: number | null;
  updated_at_user_id: number | null;
}

export interface TelefonoUsuario extends Partial<AuditFields> {
  id?: number;
  /** Teléfono completo, ej. +50241234567 */
  telefono: string;
  estado?: EstadoContacto;
}

export interface CorreoUsuario extends Partial<AuditFields> {
  id?: number;
  correo: string;
  estado?: EstadoContacto;
}

export interface Usuario extends AuditFields {
  id: number;
  nombre: string;
  correo_id: number | null;
  telefono_id: number | null;
  /** Correo de referencia (resuelto) */
  correo: string;
  /** Teléfono de referencia (resuelto) */
  telefono: string;
  correos: CorreoUsuario[];
  telefonos: TelefonoUsuario[];
  fecha_registro: string;
  estado: EstadoUsuario;
}

export interface UsuarioInput {
  nombre: string;
  correos: string[];
  telefonos: TelefonoUsuario[];
  estado?: EstadoUsuario;
  actor_user_id?: number | null;
}

export interface UsuarioFilters {
  q?: string;
  estado?: EstadoUsuario | "";
  page?: number;
  limit?: number;
}

export interface PaginatedUsuarios {
  data: Usuario[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  errors: {
    row: number;
    message: string;
    /** Resumen del registro (nombre, correo, etc.) */
    data?: string;
  }[];
  total: number;
  success: number;
}
