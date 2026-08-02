import type { Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Prisma.TransactionClient | PrismaClient;

function requestIdOf(req: Request): string | undefined {
  const id = (req as unknown as { id?: string | number }).id;
  return id === undefined ? undefined : String(id);
}

export interface AuditActor {
  actorType: 'STAFF' | 'DRIVER' | 'SYSTEM';
  staffUserId?: string;
  driverAccountId?: string;
  ipAddress?: string;
  requestId?: string;
}

/** Derives the actor block from the authenticated request — one staff OR driver, never both. */
export function auditActorFromRequest(req: Request): AuditActor {
  if (req.staffAuth) {
    return {
      actorType: 'STAFF',
      staffUserId: req.staffAuth.userId,
      ipAddress: req.ip,
      requestId: requestIdOf(req),
    };
  }
  if (req.driverAuth) {
    return {
      actorType: 'DRIVER',
      driverAccountId: req.driverAuth.driverAccountId,
      ipAddress: req.ip,
      requestId: requestIdOf(req),
    };
  }
  return { actorType: 'SYSTEM', ipAddress: req.ip, requestId: requestIdOf(req) };
}

export async function recordAudit(
  client: TxClient,
  actor: AuditActor,
  entry: { entity: string; entityId: string; action: string; before?: unknown; after?: unknown }
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorType: actor.actorType,
      staffUserId: actor.staffUserId,
      driverAccountId: actor.driverAccountId,
      ipAddress: actor.ipAddress,
      requestId: actor.requestId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      beforeJson: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
      afterJson: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
    },
  });
}
