import { NextRequest, NextResponse } from "next/server";
import { resolveActorUserId } from "@/lib/actor";
import {
  deleteUsuario,
  getUsuarioById,
  NotFoundError,
  updateUsuario,
  ValidationError,
} from "@/lib/users";

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
    { error: "No se pudo completar la operación." },
    { status: 500 }
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const usuario = await getUsuarioById(Number(id));
    if (!usuario) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }
    return NextResponse.json(usuario);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const actor_user_id = resolveActorUserId(request, body);
    const usuario = await updateUsuario(Number(id), { ...body, actor_user_id });
    return NextResponse.json(usuario);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    let actor_user_id: number | null = resolveActorUserId(request);
    try {
      const body = await request.json();
      actor_user_id = resolveActorUserId(request, body);
    } catch {
      // DELETE sin body
    }
    const usuario = await deleteUsuario(Number(id), actor_user_id);
    return NextResponse.json({ ok: true, usuario });
  } catch (err) {
    return handleError(err);
  }
}
