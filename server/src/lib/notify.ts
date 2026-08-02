import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { notificationsQueue, JOB_NAMES } from './queue.js';
import type { NotificationType } from '@prisma/client';

/**
 * Creates a Notification row (deduped via the unique `dedupeKey` — one per
 * entity+type+day, so a daily scan job never re-alerts on the same thing)
 * and enqueues its delivery. Channel is decided here, once, based on
 * whether a real email provider is configured — not re-decided at send
 * time — so a Notification row always accurately reflects how it was
 * actually attempted.
 */
export async function queueNotification(params: {
  branchId: string;
  type: NotificationType;
  entity: string;
  entityId: string;
  subject: string;
  message: string;
}) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = `${params.type}:${params.entityId}:${dayKey}`;

  const recipient = env.RESEND_API_KEY ? await findOwnerEmail(params.branchId) : null;
  const channel = recipient ? 'EMAIL' : 'LOG';

  try {
    const notification = await prisma.notification.create({
      data: {
        branchId: params.branchId,
        type: params.type,
        entity: params.entity,
        entityId: params.entityId,
        dedupeKey,
        channel,
        recipient: recipient ?? 'console',
        subject: params.subject,
        message: params.message,
      },
    });
    await notificationsQueue.add(JOB_NAMES.SEND_NOTIFICATION, { notificationId: notification.id });
    return notification;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Already notified about this exact entity today — expected on a
      // daily scan, not an error.
      return null;
    }
    throw err;
  }
}

async function findOwnerEmail(branchId: string): Promise<string | null> {
  const owner = await prisma.user.findFirst({ where: { branchId, role: 'OWNER', isActive: true, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  return owner?.email ?? null;
}
