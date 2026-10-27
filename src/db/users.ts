import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import { users } from "./schema.ts";

export async function getOrCreateUser(uid: string, email: string, name?: string | null) {
  const normEmail = email.trim().toLowerCase();

  // 1. Tìm theo uid
  const [existingByUid] = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
  if (existingByUid) {
    if (name && existingByUid.name !== name) {
      const [updated] = await db.update(users).set({ name }).where(eq(users.id, existingByUid.id)).returning();
      return updated ?? existingByUid;
    }
    return existingByUid;
  }

  // 2. Tìm theo email (đã tạo tài khoản qua email/password trước đó)
  const [existingByEmail] = await db.select().from(users).where(eq(users.email, normEmail)).limit(1);
  if (existingByEmail) {
    const [linked] = await db
      .update(users)
      .set({ uid, ...(name ? { name } : {}) })
      .where(eq(users.id, existingByEmail.id))
      .returning();
    return linked ?? existingByEmail;
  }

  // 3. Tạo mới nếu chưa tồn tại
  const [created] = await db
    .insert(users)
    .values({
      uid,
      email: normEmail,
      name: name ?? null,
    })
    .returning();

  return created;
}

