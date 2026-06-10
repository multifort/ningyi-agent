import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { login as apiLogin, register as apiRegister, getMe, logout as apiLogout, User } from "../api/auth";
import { getToken } from "../api/client";
import { useSettingsStore } from "../stores/settingsStore";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { loadSettings } = useSettingsStore();

  const refreshUser = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadSettings();
      const token = await getToken();
      if (token) {
        await refreshUser();
      }
      setIsLoading(false);
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    setUser(res.user);
  };

  const register = async (username: string, password: string) => {
    const res = await apiRegister(username, password);
    setUser(res.user);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
