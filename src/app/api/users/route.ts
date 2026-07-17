import { NextRequest, NextResponse } from "next/server";
import { resolveActorUserId } from "@/lib/actor";
import {
  createUsuario,
  listUsuarios,
  NotFoundError,
  ValidationError,
} from "@/lib/users";
import type { EstadoUsuario } from "@/lib/types";

function handleError(err: unknown) {
  if (err instanceof ValidationError || err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  const message = err instanceof Error ? err.message : "Error interno";
  const isDuplicate =
    typeof message === "string" &&
    (message.includes("Duplicate") || message.includes("ER_DUP_ENTRY"));

  if (isDuplicate) {
    return NextResponse.json(
      { error: "Ya existe un usuario con ese correo." },
      { status: 409 }
    );
  }

  console.error(err);
  return NextResponse.json(
    { error: "No se pudo completar la operación. Verifica la conexión a MySQL." },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q") || undefined;
    const estado = (searchParams.get("estado") || "") as EstadoUsuario | "";
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 10);

    const result = await listUsuarios({ q, estado, page, limit });
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const actor_user_id = resolveActorUserId(request, body);
    const usuario = await createUsuario({ ...body, actor_user_id });
    return NextResponse.json(usuario, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
