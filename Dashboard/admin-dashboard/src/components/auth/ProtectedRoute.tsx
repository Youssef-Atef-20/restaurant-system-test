import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { PermissionKey } from '../../types';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Required permission key. If omitted, just requires authentication. */
  permission?: PermissionKey;
  /** If true, only the owner can access this route */
  ownerOnly?: boolean;
}

export function ProtectedRoute({ children, permission, ownerOnly }: ProtectedRouteProps) {
  const { authUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <span className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  // Owner-only routes
  if (ownerOnly && authUser.role !== 'owner') {
    return <Navigate to="/dashboard" replace />;
  }

  // Permission-protected routes
  if (permission && authUser.role !== 'owner' && !authUser.permissions.has(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
