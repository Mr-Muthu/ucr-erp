import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { businessLog } from '../lib/logger.js';

/**
 * Delivers one already-created Notification row. `channel` was decided at
 * creation time (lib/notify.ts) based on whether Resend is configured — a
 * dev environment with no real email provider (the same gap as R2 in
 * Phase 2 / Redis before this phase) still gets a fully working feature,
 * just visible as a structured log line instead of an inbox arrival.
 */
export async function sendNotification(notificationId: string) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) return;
  if (notification.status !== 'PENDING') return; // already handled — a retried job shouldn't double-send

  if (notification.channel === 'LOG') {
    businessLog.info({ notification: { type: notification.type, subject: notification.subject, message: notification.message } }, 'Notification (no email provider configured — logged only)');
    await prisma.notification.update({ where: { id: notificationId }, data: { status: 'SENT', sentAt: new Date() } });
    return;
  }

  if (notification.channel === 'EMAIL') {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'UCR Fleet ERP <alerts@ucrfleet.example>',
          to: [notification.recipient],
          subject: notification.subject,
          text: notification.message,
        }),
      });
      if (!res.ok) throw new Error(`Resend API ${res.status}: ${await res.text()}`);
      await prisma.notification.update({ where: { id: notificationId }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await prisma.notification.update({ where: { id: notificationId }, data: { status: 'FAILED', errorMessage: message } });
      throw err; // let BullMQ's retry policy handle transient failures
    }
  }
}
