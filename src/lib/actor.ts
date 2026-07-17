import { NextRequest } from "next/server";

export function resolveActorUserId(
  request: NextRequest,
  body?: { actor_user_id?: number | null }
): number | null {
  const fromHeader = request.headers.get("x-actor-user-id");
  if (fromHeader && Number(fromHeader) > 0) return Number(fromHeader);

  if (body?.actor_user_id != null && Number(body.actor_user_id) > 0) {
    return Number(body.actor_user_id);
  }

  const fromEnv = process.env.ACTOR_USER_ID;
  if (fromEnv && Number(fromEnv) > 0) return Number(fromEnv);

  return null;
}
