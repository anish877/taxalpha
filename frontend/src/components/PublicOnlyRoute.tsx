import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { AppSpinner } from './AppSpinner';

interface PublicOnlyRouteProps {
  children: JSX.Element;
}

export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AppSpinner />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
