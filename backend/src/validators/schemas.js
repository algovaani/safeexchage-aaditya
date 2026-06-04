import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const depositSchema = z.object({
  amount: z.number().positive(),
  reference: z.string().optional(),
});

export const withdrawSchema = z.object({
  amount: z.number().positive(),
});

export const orderSchema = z
  .object({
    symbol: z.string().min(3),
    side: z.enum(['buy', 'sell']),
    orderType: z.enum(['market', 'limit']),
    quantity: z.number().positive(),
    price: z.number().positive().optional().nullable(),
    stopLoss: z.number().positive().optional().nullable(),
    takeProfit: z.number().positive().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.orderType === 'limit' && (val.price == null || val.price <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Limit orders require a positive price' });
    }
  });

export const manualPriceSchema = z.object({
  symbol: z.string().min(3),
  interval: z.string(),
  openTime: z.number(),
  mode: z.enum(['candle', 'tick']).default('candle'),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  close: z.number().optional(),
  volume: z.number().optional(),
  tickTime: z.number().optional(),
  price: z.number().optional(),
});
