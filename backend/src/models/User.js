import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      sparse: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    mobile: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['user', 'admin', 'system'], default: 'user' },
    status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
    emailVerified: { type: Boolean, default: false },
    mobileVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('validate', function ensureContact(next) {
  if (!this.email && !this.mobile) {
    next(new Error('Either email or mobile is required'));
  } else {
    next();
  }
});

export const User = mongoose.model('User', userSchema);
