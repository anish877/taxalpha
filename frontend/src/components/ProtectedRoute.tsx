import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { AppSpinner } from './AppSpinner';

interface ProtectedRouteProps {
  children: JSX.Element;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AppSpinner />;
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return children;
}
