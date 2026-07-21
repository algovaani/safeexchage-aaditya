import mongoose from 'mongoose';

const systemLogSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ['fatal', 'error', 'warn'],
      default: 'error',
      index: true,
    },
    /** uncaughtException | unhandledRejection | http | process | service */
    source: {
      type: String,
      enum: ['uncaughtException', 'unhandledRejection', 'http', 'process', 'service'],
      required: true,
      index: true,
    },
    message: { type: String, required: true, maxlength: 4000 },
    stack: { type: String, default: '', maxlength: 20000 },
    /** Human-readable crash site, e.g. "services/orderService.js:142" or "POST /api/orders" */
    location: { type: String, default: '', maxlength: 512, index: true },
    method: { type: String, default: '', maxlength: 16 },
    path: { type: String, default: '', maxlength: 512 },
    statusCode: { type: Number, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ip: { type: String, default: '', maxlength: 64 },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'system_logs' }
);

systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ level: 1, createdAt: -1 });
systemLogSchema.index({ source: 1, createdAt: -1 });

export const SystemLog = mongoose.model('SystemLog', systemLogSchema);
