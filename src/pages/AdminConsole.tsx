import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Profile from './Profile';

const AdminConsole: React.FC = () => {
  const { currentUser, listenersReady } = useAuth();

  if (!listenersReady) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center text-gray-500">
        <div className="animate-spin w-10 h-10 border-4 border-[#F25129] border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm font-medium">Preparing your admin console…</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.role !== 'admin') {
    return <Navigate to="/profile" replace />;
  }

  return <Profile mode="admin" />;
};

export default AdminConsole;

