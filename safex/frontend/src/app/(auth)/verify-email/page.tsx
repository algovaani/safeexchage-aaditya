import { Suspense } from 'react';
import VerifyEmailClient from './verify-email-client';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-primary" />}>
      <VerifyEmailClient />
    </Suspense>
  );
}
