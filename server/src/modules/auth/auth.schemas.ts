import { z } from 'zod';

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const driverDeviceSchema = z.object({
  clientDeviceId: z.string().min(4), // stable id the app generates once and persists locally
  expoPushToken: z.string().optional(),
  deviceModel: z.string().optional(),
  appVersion: z.string().optional(),
  osVersion: z.string().optional(),
});

export const driverLoginSchema = z.object({
  phone: z.string().min(6),
  pin: z.string().min(4).max(8),
  device: driverDeviceSchema,
});
