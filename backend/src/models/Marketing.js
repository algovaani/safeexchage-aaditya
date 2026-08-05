import mongoose from 'mongoose';

const marketingBannerSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    enabled: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'marketing_banners' }
);

const marketingNoticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '', trim: true },
    enabled: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'marketing_notices' }
);

const supportContactSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    /** When true, name and phone are visible to users. Email is always public when set. */
    showContactDetails: { type: Boolean, default: false },
    showName: { type: Boolean, default: false },
    showPhone: { type: Boolean, default: false },
    showEmail: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'support_contacts' }
);

export const MarketingBanner = mongoose.model('MarketingBanner', marketingBannerSchema);
export const MarketingNotice = mongoose.model('MarketingNotice', marketingNoticeSchema);
export const SupportContact = mongoose.model('SupportContact', supportContactSchema);

