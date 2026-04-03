import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Public entry for QR / shared links: /invite?ref={userId}
 * Mobile app encodes this URL; we forward to register with the same query param.
 */
export default function InvitePage() {
  const [params] = useSearchParams();
  const ref = params.get('ref')?.trim();
  if (!ref) {
    return <Navigate to="/register" replace />;
  }
  return <Navigate to={`/register?ref=${encodeURIComponent(ref)}`} replace />;
}
