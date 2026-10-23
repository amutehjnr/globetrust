'use strict';

const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[0-9]/, 'Include a number'),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +234...')
    .optional()
    .or(z.literal(''))
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128)
});

const forgotSchema = z.object({
  email: z.string().email().max(254)
});

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(12)
    .max(128)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
});

const mfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code')
});

function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    const err = new Error(message);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return result.data;
}

module.exports = {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  mfaVerifySchema,
  parseBody
};
