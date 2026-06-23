'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '@/lib/api';

const STEPS = ['Personal Info', 'Documents', 'Selfie', 'Review'];

export default function KycPage() {
  const [step, setStep] = useState(0);
  const [docType, setDocType] = useState('PASSPORT');
  const [files, setFiles] = useState<Record<string, File | null>>({
    documentFront: null, documentBack: null, selfie: null, addressProof: null,
  });
  const qc = useQueryClient();

  const { data } = useQuery<{
    user: { name: string; email: string; mobile: string };
    kyc: { status: string; rejectionReason?: string };
  }>({
    queryKey: ['kyc-status'],
    queryFn: async () => unwrap(await api.get('/kyc/status')),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('documentType', docType);
      Object.entries(files).forEach(([k, f]) => { if (f) fd.append(k, f); });
      const res = await api.post('/kyc/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return unwrap(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kyc-status'] }),
  });

  const kyc = data?.kyc;
  const user = data?.user;
  const status = kyc?.status || 'NOT_SUBMITTED';

  if (status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED') {
    const badge =
      status === 'PENDING' ? 'text-amber' :
      status === 'APPROVED' ? 'text-profit' : 'text-loss';
    return (
      <div className="ui-card max-w-lg">
        <h1 className="text-xl font-medium mb-4">KYC Status</h1>
        <p className={`text-lg font-medium ${badge}`}>
          {status === 'PENDING' && 'Under Review — usually 24–48 hours'}
          {status === 'APPROVED' && 'KYC Verified ✓'}
          {status === 'REJECTED' && `Rejected: ${kyc?.rejectionReason || 'See admin note'}`}
        </p>
        {status === 'REJECTED' && (
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>Re-submit</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-medium">KYC Verification</h1>
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex-1 h-1 rounded ${i <= step ? 'bg-accent' : 'bg-tertiary'}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="ui-card space-y-3">
          <p><span className="text-text-secondary">Name:</span> {user?.name}</p>
          <p><span className="text-text-secondary">Email:</span> {user?.email}</p>
          <p><span className="text-text-secondary">Mobile:</span> {user?.mobile}</p>
          <button className="btn-primary" onClick={() => setStep(1)}>Continue</button>
        </div>
      )}

      {step === 1 && (
        <div className="ui-card space-y-4">
          <select className="ui-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="PASSPORT">Passport</option>
            <option value="DRIVING_LICENSE">Driving License</option>
            <option value="NATIONAL_ID">National ID</option>
          </select>
          {['documentFront', 'documentBack', 'addressProof'].map((f) => (
            <div key={f}>
              <label className="ui-label">{f}</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setFiles({ ...files, [f]: e.target.files?.[0] || null })} />
            </div>
          ))}
          <button className="btn-primary" onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="ui-card space-y-4">
          <ul className="text-xs text-text-secondary space-y-1">
            <li>✓ Look straight at camera</li>
            <li>✓ Good lighting</li>
            <li>✓ No glasses</li>
          </ul>
          <input type="file" accept="image/*" onChange={(e) => setFiles({ ...files, selfie: e.target.files?.[0] || null })} />
          <button className="btn-primary" onClick={() => setStep(3)}>Continue</button>
        </div>
      )}

      {step === 3 && (
        <div className="ui-card space-y-4">
          <p className="text-sm">Document type: {docType}</p>
          <p className="text-xs text-text-secondary">Review uploads before submitting.</p>
          <button className="btn-primary" onClick={() => submit.mutate()} disabled={submit.isPending}>
            Submit KYC
          </button>
        </div>
      )}
    </div>
  );
}
