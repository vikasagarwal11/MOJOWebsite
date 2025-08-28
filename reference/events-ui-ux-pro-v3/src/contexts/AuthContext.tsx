
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/config/firebase';

type CurrentUser = { id: string; role?: 'admin'|'member' } | null;
type AuthCtx = { currentUser: CurrentUser; loading: boolean; };

const Ctx = createContext<AuthCtx>({ currentUser: null, loading: true });

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, (u: User | null) => {
    setCurrentUser(u ? { id: u.uid } : null);
    setLoading(false);
  }), []);
  return <Ctx.Provider value={{ currentUser, loading }}>{children}</Ctx.Provider>;
};

export function useAuth(){ return useContext(Ctx); }
