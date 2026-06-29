import { Navigate, useParams } from 'react-router-dom';
import { normalizeReferralCode } from '../utils/referral.js';

/** Public short link: /invite/ABC123 → signup with ref pre-filled */
export default function InviteRedirect() {
  const { code } = useParams();
  const ref = normalizeReferralCode(code);
  if (!ref) return <Navigate to="/signup" replace />;
  return <Navigate to={`/signup?ref=${encodeURIComponent(ref)}`} replace />;
}
