"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  joinTelefonoUI,
  onlyDigits,
  PAISES_CA,
  splitTelefonoUI,
  type CodigoForm,
} from "@/lib/phones";
import type {
  EstadoUsuario,
  ImportResult,
  PaginatedUsuarios,
  TelefonoUsuario,
  Usuario,
  UsuarioInput,
} from "@/lib/types";

function emptyPhone(): TelefonoUsuario {
  return { telefono: "" };
}

const emptyForm: UsuarioInput = {
  nombre: "",
  correos: [""],
  telefonos: [emptyPhone()],
};

function formatDate(value: string) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const LIST_PREVIEW_LIMIT = 2;

function PhonesCell({ user }: { user: Usuario }) {
  const phones =
    user.telefonos?.length > 0
      ? user.telefonos
          .filter((t) => (t.estado ?? "activo") === "activo")
          .map((t) => t.telefono)
      : user.telefono
        ? [user.telefono]
        : [];

  if (!phones.length) return <span className="text-slate-400">—</span>;

  const visible = phones.slice(0, LIST_PREVIEW_LIMIT);
  const rest = phones.length - visible.length;

  return (
    <ul className="space-y-1">
      {visible.map((tel) => (
        <li key={tel} className="font-mono text-xs text-slate-700">
          {tel}
        </li>
      ))}
      {rest > 0 && (
        <li className="text-xs text-slate-500">+{rest} más · Ver</li>
      )}
    </ul>
  );
}

function EmailsCell({ user }: { user: Usuario }) {
  const emails =
    user.correos?.length > 0
      ? user.correos
          .filter((c) => (c.estado ?? "activo") === "activo")
          .map((c) => c.correo)
      : user.correo
        ? [user.correo]
        : [];

  if (!emails.length) return <span className="text-slate-400">—</span>;

  const visible = emails.slice(0, LIST_PREVIEW_LIMIT);
  const rest = emails.length - visible.length;

  return (
    <ul className="space-y-1">
      {visible.map((correo) => (
        <li key={correo} className="text-xs text-slate-700">
          {correo}
        </li>
      ))}
      {rest > 0 && (
        <li className="text-xs text-slate-500">+{rest} más · Ver</li>
      )}
    </ul>
  );
}

function EstadoBadge({ estado }: { estado?: string }) {
  const active = (estado ?? "activo") === "activo";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
        active
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-200 text-slate-600"
      }`}
    >
      {active ? "activo" : "inactivo"}
    </span>
  );
}

export default function UsersManager() {
  const [data, setData] = useState<PaginatedUsuarios | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoUsuario | "">("activo");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState<UsuarioInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<Usuario | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importElapsed, setImportElapsed] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function loadUsers(opts?: {
    q?: string;
    estado?: EstadoUsuario | "";
    page?: number;
  }) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const search = opts?.q ?? q;
      const filterEstado = opts?.estado ?? estado;
      const currentPage = opts?.page ?? page;

      if (search) params.set("q", search);
      if (filterEstado) params.set("estado", filterEstado);
      params.set("page", String(currentPage));
      params.set("limit", "10");

      const res = await fetch(`/api/users?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar usuarios");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    if (!importing) {
      setImportElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setImportElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [importing]);

  function formatElapsed(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m <= 0) return `${s}s`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      correos: [""],
      telefonos: [emptyPhone()],
    });
    setModalOpen(true);
  }

  async function openView(user: Usuario) {
    setViewLoading(true);
    setViewOpen(true);
    setViewing(null);
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`);
      const full = await res.json();
      if (!res.ok) throw new Error(full.error || "No se pudo cargar el usuario");
      setViewing(full as Usuario);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al visualizar");
      setViewOpen(false);
    } finally {
      setViewLoading(false);
    }
  }

  async function openEdit(user: Usuario) {
    setError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`);
      const full = await res.json();
      if (!res.ok) throw new Error(full.error || "No se pudo cargar el usuario");

      const source = full as Usuario;
      const activeEmails = (source.correos ?? [])
        .filter((c) => (c.estado ?? "activo") === "activo")
        .map((c) => c.correo);
      const activePhones = (source.telefonos ?? [])
        .filter((t) => (t.estado ?? "activo") === "activo")
        .map((t) => ({
          ...t,
          telefono: t.telefono || "",
        }));

      setEditing(source);
      setForm({
        nombre: source.nombre,
        correos: activeEmails.length
          ? activeEmails
          : source.correo
            ? [source.correo]
            : [""],
        telefonos: activePhones.length ? activePhones : [emptyPhone()],
      });
      setModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al editar");
    }
  }

  function updatePhone(index: number, value: string) {
    setForm((prev) => ({
      ...prev,
      telefonos: prev.telefonos.map((t, i) =>
        i === index ? { ...t, telefono: value } : t
      ),
    }));
  }

  function updatePhoneCodigo(index: number, codigo: CodigoForm) {
    const current = form.telefonos[index]?.telefono ?? "";
    const { local } = splitTelefonoUI(current);
    updatePhone(index, joinTelefonoUI(codigo, local));
  }

  function updatePhoneLocal(index: number, localRaw: string) {
    const current = form.telefonos[index]?.telefono ?? "";
    const { codigo } = splitTelefonoUI(current);
    const pais = PAISES_CA.find((p) => p.codigo === codigo);
    const max = codigo === "otro" ? 15 : (pais?.digitos ?? 8);
    const local = onlyDigits(localRaw).slice(0, max);
    updatePhone(index, joinTelefonoUI(codigo, local));
  }

  function addPhone() {
    setForm((prev) => ({
      ...prev,
      telefonos: [...prev.telefonos, emptyPhone()],
    }));
  }

  function removePhone(index: number) {
    setForm((prev) => {
      if (prev.telefonos.length <= 1) return prev;
      return {
        ...prev,
        telefonos: prev.telefonos.filter((_, i) => i !== index),
      };
    });
  }

  function updateEmail(index: number, value: string) {
    setForm((prev) => ({
      ...prev,
      correos: prev.correos.map((c, i) => (i === index ? value : c)),
    }));
  }

  function addEmail() {
    setForm((prev) => ({ ...prev, correos: [...prev.correos, ""] }));
  }

  function removeEmail(index: number) {
    setForm((prev) => {
      if (prev.correos.length <= 1) return prev;
      return {
        ...prev,
        correos: prev.correos.filter((_, i) => i !== index),
      };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form };
      const res = await fetch(
        editing ? `/api/users/${editing.id}` : "/api/users",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar");

      setModalOpen(false);
      setNotice(editing ? "Usuario actualizado." : "Usuario creado.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onInactivate(user: Usuario) {
    if (
      !confirm(
        `¿Inactivar a ${user.nombre}? El registro no se elimina, solo queda inactivo.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo inactivar");
      setNotice("Usuario inactivado.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al inactivar");
    }
  }

  async function onToggleEstado(user: Usuario) {
    const next: EstadoUsuario =
      user.estado === "activo" ? "inactivo" : "activo";
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: user.nombre,
          correos: user.correos?.map((c) => c.correo) ?? [user.correo],
          telefonos: user.telefonos,
          estado: next,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo actualizar");
      setNotice(`Estado cambiado a ${next}.`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    loadUsers({ page: 1 });
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (!importFile) {
      setError("Selecciona un archivo CSV o Excel.");
      return;
    }
    setImporting(true);
    setImportElapsed(0);
    setImportResult(null);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", importFile);

      const res = await fetch("/api/users/import", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error en la importación");
      setImportResult(json);
      setImportFile(null);
      const failed = json.errors?.length ?? 0;
      if (failed === 0) {
        setNotice(
          `Importación completa: ${json.inserted} nuevos, ${json.updated} actualizados.`
        );
      }
      await loadUsers({ page: 1 });
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setImporting(false);
    }
  }

  const users = data?.data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium tracking-wide text-teal-700">
            Administración interna
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Gestión de usuarios
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            Alta, edición, búsqueda e importación masiva de usuarios.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (importing) return;
              setImportOpen(true);
              setImportResult(null);
              setImportFile(null);
            }}
            disabled={importing}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Importar CSV / Excel
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Nuevo usuario
          </button>
        </div>
      </header>

      {(error || notice) && (
        <div className="mb-4 space-y-2">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
              <button
                type="button"
                className="ml-3 underline"
                onClick={() => setError(null)}
              >
                Cerrar
              </button>
            </div>
          )}
          {notice && (
            <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
              {notice}
              <button
                type="button"
                className="ml-3 underline"
                onClick={() => setNotice(null)}
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={onSearch}
        className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_180px_auto]"
      >
        <div>
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">
            Buscar
          </label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, correo o teléfono"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div>
          <label
            htmlFor="estado"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Estado
          </label>
          <select
            id="estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoUsuario | "")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          >
            <option value="">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setEstado("activo");
              setPage(1);
              loadUsers({ q: "", estado: "activo", page: 1 });
            }}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correos</th>
                <th className="px-4 py-3 font-medium">Teléfonos</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Cargando usuarios…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No hay usuarios con esos criterios.
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.nombre}
                    </td>
                    <td className="px-4 py-3">
                      <EmailsCell user={user} />
                    </td>
                    <td className="px-4 py-3">
                      <PhonesCell user={user} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onToggleEstado(user)}
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          user.estado === "activo"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                        title="Clic para cambiar estado"
                      >
                        {user.estado}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openView(user)}
                          className="text-sm font-medium text-slate-700 hover:underline"
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="text-sm font-medium text-teal-700 hover:underline"
                        >
                          Editar
                        </button>
                        {user.estado === "activo" && (
                          <button
                            type="button"
                            onClick={() => onInactivate(user)}
                            className="text-sm font-medium text-red-600 hover:underline"
                          >
                            Inactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {data && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              {data.total} usuario{data.total === 1 ? "" : "s"} · página{" "}
              {data.page} de {data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {viewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Detalle del usuario
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Solo lectura
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewOpen(false);
                  setViewing(null);
                }}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Cerrar
              </button>
            </div>

            {viewLoading && (
              <div className="flex flex-col items-center justify-center px-5 py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700" />
                <p className="mt-3 text-sm text-slate-500">Cargando…</p>
              </div>
            )}

            {!viewLoading && viewing && (
              <div className="space-y-5 px-5 py-5 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Nombre
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {viewing.nombre}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Estado
                    </p>
                    <p className="mt-1">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          viewing.estado === "activo"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {viewing.estado}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Fecha de registro
                    </p>
                    <p className="mt-1 text-slate-800">
                      {formatDate(viewing.fecha_registro)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Correos
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(viewing.correos?.length
                      ? viewing.correos
                      : viewing.correo
                        ? [
                            {
                              id: viewing.correo_id ?? undefined,
                              correo: viewing.correo,
                              estado: "activo" as const,
                            },
                          ]
                        : []
                    ).map((c, i) => (
                      <li
                        key={c.id ?? `${c.correo}-${i}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-slate-800"
                      >
                        <span className="min-w-0 break-all">{c.correo}</span>
                        <EstadoBadge estado={c.estado} />
                      </li>
                    ))}
                    {!viewing.correos?.length && !viewing.correo && (
                      <li className="text-slate-400">Sin correos</li>
                    )}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Teléfonos
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(viewing.telefonos?.length
                      ? viewing.telefonos
                      : viewing.telefono
                        ? [
                            {
                              id: viewing.telefono_id ?? undefined,
                              telefono: viewing.telefono,
                              estado: "activo" as const,
                            },
                          ]
                        : []
                    ).map((t, i) => (
                      <li
                        key={t.id ?? `${t.telefono}-${i}`}
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
                      >
                        <span className="min-w-0 break-all">{t.telefono}</span>
                        <EstadoBadge estado={t.estado} />
                      </li>
                    ))}
                    {!viewing.telefonos?.length && !viewing.telefono && (
                      <li className="font-sans text-slate-400">Sin teléfonos</li>
                    )}
                  </ul>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setViewOpen(false);
                      setViewing(null);
                    }}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const u = viewing;
                      setViewOpen(false);
                      setViewing(null);
                      if (u) openEdit(u);
                    }}
                    className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                  >
                    Editar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? "Editar usuario" : "Nuevo usuario"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Fecha de registro automática · estado inicial activo
              </p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Nombre
                </label>
                <input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-600">
                    Correos
                  </label>
                  <button
                    type="button"
                    onClick={addEmail}
                    className="text-xs font-medium text-teal-700 hover:underline"
                  >
                    + Agregar correo
                  </button>
                </div>
                <div className="space-y-2">
                  {form.correos.map((correo, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        required
                        type="email"
                        value={correo}
                        onChange={(e) => updateEmail(index, e.target.value)}
                        placeholder="correo@ejemplo.com"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                      />
                      {form.correos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEmail(index)}
                          className="shrink-0 text-xs text-red-600 hover:underline"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Al quitar un correo o teléfono se{" "}
                  <strong>inactiva</strong> (no se borra). En Ver puedes ver
                  activos e inactivos.
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-600">
                    Teléfonos
                  </label>
                  <button
                    type="button"
                    onClick={addPhone}
                    className="text-xs font-medium text-teal-700 hover:underline"
                  >
                    + Agregar teléfono
                  </button>
                </div>
                <p className="mb-2 text-[11px] text-slate-500">
                  Elige el país; el número local se limita a los dígitos
                  permitidos.
                </p>
                <div className="space-y-2">
                  {form.telefonos.map((tel, index) => {
                    const parts = splitTelefonoUI(tel.telefono);
                    const pais = PAISES_CA.find(
                      (p) => p.codigo === parts.codigo
                    );
                    const max =
                      parts.codigo === "otro" ? 15 : (pais?.digitos ?? 8);

                    return (
                      <div
                        key={index}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        <select
                          value={parts.codigo}
                          onChange={(e) =>
                            updatePhoneCodigo(
                              index,
                              e.target.value as CodigoForm
                            )
                          }
                          className="w-full shrink-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 sm:w-52"
                        >
                          {PAISES_CA.map((p) => (
                            <option key={p.codigo} value={p.codigo}>
                              {p.nombre} (+{p.codigo})
                            </option>
                          ))}
                          <option value="otro">Otro (internacional)</option>
                        </select>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {parts.codigo !== "otro" && (
                            <span className="shrink-0 font-mono text-xs text-slate-500">
                              +{parts.codigo}
                            </span>
                          )}
                          <input
                            required
                            inputMode="numeric"
                            value={parts.local}
                            maxLength={max}
                            onChange={(e) =>
                              updatePhoneLocal(index, e.target.value)
                            }
                            placeholder={
                              parts.codigo === "otro"
                                ? "491701234567"
                                : "1".repeat(max)
                            }
                            className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                          />
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                            {parts.local.length}/{max}
                          </span>
                          {form.telefonos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePhone(index)}
                              className="shrink-0 text-xs text-red-600 hover:underline"
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            className={`relative w-full rounded-lg bg-white shadow-xl ${
              importResult?.errors.length ? "max-w-2xl" : "max-w-lg"
            }`}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {importResult && !importing
                  ? "Resultado de importación"
                  : "Importación masiva"}
              </h2>
              {!importResult && (
                <p className="mt-1 text-sm text-slate-600">
                  Acepta <strong>.csv</strong> o <strong>.xlsx</strong>. Si
                  varias filas tienen el <strong>mismo nombre</strong>, se
                  tratan como la misma persona y se unen sus correos y
                  teléfonos.
                </p>
              )}
            </div>

            {importResult && !importing ? (
              <div className="space-y-4 px-5 py-5">
                <div
                  className={`rounded-md border px-4 py-3 text-sm ${
                    importResult.errors.length > 0
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-teal-200 bg-teal-50 text-teal-950"
                  }`}
                >
                  <p className="font-semibold">
                    {importResult.errors.length > 0
                      ? "Importación parcial"
                      : "Importación completa"}
                  </p>
                  <p className="mt-1">
                    Total: <strong>{importResult.total}</strong> · Exitosas:{" "}
                    <strong>{importResult.success}</strong> · Insertados:{" "}
                    <strong>{importResult.inserted}</strong> · Actualizados:{" "}
                    <strong>{importResult.updated}</strong> · No pasaron:{" "}
                    <strong>{importResult.errors.length}</strong>
                  </p>
                </div>

                {importResult.errors.length > 0 && (
                  <div className="overflow-hidden rounded-md border border-red-200">
                    <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
                      Registros que no pasaron
                    </div>
                    <div className="max-h-64 overflow-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Fila</th>
                            <th className="px-3 py-2 font-medium">
                              Registro
                            </th>
                            <th className="px-3 py-2 font-medium">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100 bg-white">
                          {importResult.errors.map((err) => (
                            <tr key={`${err.row}-${err.message}`}>
                              <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                                {err.row}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {err.data || "—"}
                              </td>
                              <td className="px-3 py-2 text-red-700">
                                {err.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportOpen(false);
                      setImportResult(null);
                      setImportFile(null);
                    }}
                    className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onImport} className="space-y-4 px-5 py-5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Archivo CSV o Excel
                  </label>
                  <input
                    type="file"
                    disabled={importing}
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) =>
                      setImportFile(e.target.files?.[0] ?? null)
                    }
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-50"
                  />
                  {importFile && (
                    <p className="mt-2 text-xs text-slate-500">
                      {importFile.name} · {formatFileSize(importFile.size)}
                    </p>
                  )}
                </div>
                <a
                  href="/plantilla-usuarios.csv"
                  download
                  className={`inline-block text-sm font-medium text-teal-700 hover:underline ${
                    importing ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  Descargar plantilla CSV
                </a>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => {
                      if (!importing) {
                        setImportOpen(false);
                        setImportResult(null);
                        setImportFile(null);
                      }
                    }}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={importing || !importFile}
                    className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
                  >
                    {importing ? "Importando…" : "Importar"}
                  </button>
                </div>
              </form>
            )}

            {importing && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-white/95 px-6 text-center backdrop-blur-[1px]">
                <div
                  className="h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700"
                  role="status"
                  aria-label="Cargando"
                />
                <p className="mt-4 text-base font-semibold text-slate-900">
                  Importando registros…
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {importFile
                    ? `${importFile.name} (${formatFileSize(importFile.size)})`
                    : "Procesando archivo"}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Tiempo transcurrido:{" "}
                  <span className="font-medium text-slate-700">
                    {formatElapsed(importElapsed)}
                  </span>
                </p>
                <p className="mt-2 max-w-xs text-xs text-slate-500">
                  Archivos grandes (cientos de miles o 1 millón de filas) pueden
                  tardar varios minutos. No cierres esta ventana.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {importing && !importOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-900/50 px-6 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700" />
          <p className="mt-4 text-base font-semibold text-white">
            Importando registros…
          </p>
          <p className="mt-1 text-sm text-slate-200">
            {formatElapsed(importElapsed)}
          </p>
        </div>
      )}
    </div>
  );
}
