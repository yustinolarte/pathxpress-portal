import { useState, useEffect } from 'react';

export interface PortalUser {
  userId: number;
  email: string;
  role: 'admin' | 'customer';
  clientId?: number;
}

const TOKEN_KEY = 'pathxpress_portal_token';
const USER_KEY = 'pathxpress_portal_user';

export function usePortalAuth() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(TOKEN_KEY);
    }
    return null;
  });
  
  const [user, setUser] = useState<PortalUser | null>(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(USER_KEY);
      if (savedUser) {
        try {
          return JSON.parse(savedUser);
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  const login = (newToken: string, userData: PortalUser) => {
    setToken(newToken);
    setUser(userData);
    setLoading(false);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setLoading(false);
  };

  return {
    token,
    user,
    loading,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    setLoading,
    setUser,
  };
}
