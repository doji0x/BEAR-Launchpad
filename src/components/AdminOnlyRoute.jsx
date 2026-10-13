import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function AdminOnlyRoute() {
  const { user, isAuthenticated } = useAuth();
  return isAuthenticated && user?.role === 'admin' ? <Outlet /> : <Navigate to="/" replace />;
}