import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { passwordResetTokens, portalUsers } from '../drizzle/schema';
import { getDb } from './db';

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createPasswordResetToken(portalUserId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);

  await db.transaction(async (tx) => {
    // Keep at most one row per account. A new request invalidates and removes
    // every earlier link, so this table cannot grow on repeated requests.
    await tx.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.portalUserId, portalUserId));
    await tx.insert(passwordResetTokens).values({
      portalUserId,
      tokenHash: hashPasswordResetToken(token),
      expiresAt,
    });
  });

  return { token, expiresAt };
}

export async function consumePasswordResetToken(token: string, passwordHash: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [reset] = await tx.select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ))
      .limit(1);
    if (!reset) return false;

    // Claim atomically so two concurrent submissions cannot reuse one link.
    const claim = await tx.update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(
        eq(passwordResetTokens.id, reset.id),
        isNull(passwordResetTokens.usedAt),
      ));
    if (Number((claim as any)[0]?.affectedRows ?? 0) !== 1) return false;

    const update = await tx.update(portalUsers)
      .set({ passwordHash, updatedAt: now })
      .where(and(
        eq(portalUsers.id, reset.portalUserId),
        eq(portalUsers.status, 'active'),
      ));
    if (Number((update as any)[0]?.affectedRows ?? 0) !== 1) {
      throw new Error('Password reset account is no longer active');
    }
    return true;
  });
}
