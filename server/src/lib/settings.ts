import type { PrismaClient } from '@prisma/client';

/**
 * Reads a `Setting` row's value, falling back to `defaultValue` if the key
 * hasn't been seeded yet. Every business number this codebase doesn't hard
 * fix in code goes through here — never a bare literal in application logic.
 */
export async function getSetting<T>(prisma: PrismaClient, key: string, defaultValue: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : defaultValue;
}
