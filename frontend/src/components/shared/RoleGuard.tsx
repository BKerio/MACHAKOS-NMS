import { Navigate } from 'react-router-dom';
import { Role } from '@/types/api';
import { useAuthStore } from '@/stores/authStore';
import { jwtRole } from '@/lib/jwt';

interface RoleGuardProps {
  allowed: Role[];
  children: React.ReactNode;
}

function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { token, user } = useAuthStore();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // The role switcher may set activeRole locally before the backend has
  // confirmed a real role-scoped token (e.g. /auth/switch-role isn't wired up
  // yet, so it falls back to a client-only override). That override must never
  // lock the real account out of a page its actual login role can reach, so
  // the JWT's own role always wins first.
  const realRole = jwtRole(token);
  if (realRole && allowed.includes(realRole)) return <>{children}</>;

  const activeRole = user.activeRole || user.role;

  if (!allowed.includes(activeRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

export default RoleGuard;
