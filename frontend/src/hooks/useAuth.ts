"use client";

import { useState, useEffect, useCallback } from "react";
import { logout } from "@/lib/auth";
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

interface AuthUser {
  userId: string;
  username: string;
  preferredUsername: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const claims = session.tokens?.idToken?.payload;
      const preferredUsername =
        (claims?.["preferred_username"] as string) ?? currentUser.username;

      setUser({
        userId: currentUser.userId,
        username: currentUser.username,
        preferredUsername,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkUser();

    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (
        payload.event === "signedIn" ||
        payload.event === "signedOut" ||
        payload.event === "tokenRefresh"
      ) {
        checkUser();
      }
    });

    return unsubscribe;
  }, [checkUser]);

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  return { user, loading, logout: handleLogout, isAuthenticated: !!user };
}
