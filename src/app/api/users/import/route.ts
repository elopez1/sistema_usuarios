import { NextRequest, NextResponse } from "next/server";
import { resolveActorUserId } from "@/lib/actor";
import { parseImportFile } from "@/lib/import-file";
import { importUsuarios, ValidationError } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const actorFromForm = formData.get("actor_user_id");
    const actor_user_id = resolveActorUserId(request, {
      actor_user_id:
        actorFromForm != null && String(actorFromForm) !== ""
          ? Number(actorFromForm)
          : null,
    });

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Debes enviar un archivo CSV o Excel (.xlsx) en el campo 'file'." },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    const allowed =
      name.endsWith(".csv") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls");

    if (!allowed) {
      return NextResponse.json(
        { error: "Solo se admiten archivos .csv o .xlsx" },
        { status: 400 }
      );
    }

    let rows;
    try {
      rows = await parseImportFile(file);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "No se pudo leer el archivo.",
        },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "El archivo no contiene filas de datos." },
        { status: 400 }
      );
    }

    const payload = rows.map((row) => ({
      nombre: row.nombre,
      correo: row.correo,
      correos: row.correos,
      telefono: row.telefono,
      telefonos: row.telefonos,
      codigo_pais: row.codigo_pais,
    }));

    // Importación parcial: guarda los válidos y reporta errores fila a fila
    const result = await importUsuarios(payload, actor_user_id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json(
      { error: "No se pudo importar el archivo." },
      { status: 500 }
    );
  }
}
