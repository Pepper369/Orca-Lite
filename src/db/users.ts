import { db } from "./index.ts";
import { users } from "./schema.ts";

export async function getOrCreateUser(uid: string, email: string, name?: string | null) {
  const result = await db
    .insert(users)
    .values({
      uid,
      email,
      name: name ?? null,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        ...(name ? { name } : {}),
      },
    })
    .returning();

  return result[0];
}
