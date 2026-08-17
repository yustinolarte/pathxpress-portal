import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { passwordResetTokens, portalUsers } from '../drizzle/schema';
import { comparePassword, hashPassword } from './portalAuth';
import { getDb } from './db';
import { consumePasswordResetToken, createPasswordResetToken, hashPasswordResetToken, PASSWORD_RESET_TTL_MS } from './passwordReset';

describe('password reset security helpers', () => {
  it('creates a deterministic SHA-256 digest without retaining the raw token', () => {
    const raw = 'a'.repeat(64);
    const digest = hashPasswordResetToken(raw);
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(raw);
    expect(hashPasswordResetToken(raw)).toBe(digest);
  });

  it('does not collide for different links and expires in 30 minutes', () => {
    expect(hashPasswordResetToken('a'.repeat(64))).not.toBe(hashPasswordResetToken('b'.repeat(64)));
    expect(PASSWORD_RESET_TTL_MS).toBe(30 * 60 * 1000);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('password reset one-time flow (test database)', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let userId = 0;
  const email = `password-reset-${Date.now()}@pathxpress.internal`;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error('Test database is unavailable');
    const insert = await db.insert(portalUsers).values({
      email,
      passwordHash: await hashPassword('Initial123'),
      role: 'customer',
      status: 'active',
    });
    userId = Number((insert as any)[0].insertId);
  });

  afterAll(async () => {
    if (!db || !userId) return;
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.portalUserId, userId));
    await db.delete(portalUsers).where(eq(portalUsers.id, userId));
  });

  it('stores only the digest, updates the password, and rejects reuse', async () => {
    const { token, expiresAt } = await createPasswordResetToken(userId);
    const [stored] = await db!.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.portalUserId, userId));
    expect(stored.tokenHash).toBe(hashPasswordResetToken(token));
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.usedAt).toBeNull();
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const newHash = await hashPassword('Changed123');
    expect(await consumePasswordResetToken(token, newHash)).toBe(true);
    expect(await consumePasswordResetToken(token, newHash)).toBe(false);

    const [updatedUser] = await db!.select().from(portalUsers).where(eq(portalUsers.id, userId));
    expect(await comparePassword('Changed123', updatedUser.passwordHash)).toBe(true);
  });
});
