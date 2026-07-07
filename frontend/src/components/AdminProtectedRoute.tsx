import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { AppSpinner } from './AppSpinner';

interface AdminProtectedRouteProps {
  children: JSX.Element;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AppSpinner />;
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
