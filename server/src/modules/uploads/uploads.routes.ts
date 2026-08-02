import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.js';
import { presignUpload } from '../../lib/r2.js';

const presignSchema = z.object({
  purpose: z.enum([
    'DUTY_ODOMETER_PHOTO',
    'DUTY_SIGNATURE',
    'DUTY_RECEIPT',
    'VEHICLE_DOCUMENT',
    'DRIVER_DOCUMENT',
    'CUSTOMER_ID_PROOF',
    'VENDOR_CONTRACT',
  ]),
  contentType: z.string().min(3),
  extension: z.string().min(1).max(10),
});

/**
 * Mounted twice (staff and driver) with different auth middleware applied
 * by the caller — presigning itself doesn't care which kind of session it
 * is, only that the requester is authenticated. Presigned URLs expire in
 * <=10 minutes (env.R2_PRESIGN_EXPIRY_SECONDS, capped at 600 in config).
 */
export function createUploadsRouter(authMiddleware: RequestHandler): Router {
  const router = Router();
  router.use(authMiddleware);
  router.post('/presign', validateBody(presignSchema), async (req, res) => {
    const result = await presignUpload(req.body);
    res.json(result);
  });
  return router;
}
