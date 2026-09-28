import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { auth } from '../lib/auth';

type AuthContextValue = ReturnType<typeof auth.getSnapshot> & {
  login: typeof auth.login;
  signup: typeof auth.signup;
  me: typeof auth.me;
  refresh: typeof auth.refresh;
  logout: typeof auth.logout;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getServerSnapshot);
  return (
    <AuthContext.Provider
      value={{
        ...state,
        login: auth.login,
        signup: auth.signup,
        me: auth.me,
        refresh: auth.refresh,
        logout: auth.logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider 안에서 useAuth를 사용해야 합니다.');
  return value;
}
