import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Z]/, 'Need uppercase')
  .regex(/[0-9]/, 'Need number')
  .regex(/[^A-Za-z0-9]/, 'Need special char');

export const registerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email(),
  mobile: z
    .string()
    .regex(/^\+?[1-9]\d{9,14}$/)
    .optional(),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const loginSchema = z.object({
  emailOrMobile: z.string().min(3),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotSchema = z.object({
  email: z.string().email(),
});

export const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: passwordSchema,
});
