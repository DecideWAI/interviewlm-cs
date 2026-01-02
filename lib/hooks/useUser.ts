"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}

export interface UserProfile extends User {
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  company?: string;
  phone?: string;
  avatar?: string;
}

/**
 * Client-side hook to get current authenticated user
 * Uses NextAuth session
 */
export function useUser() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (session?.user) {
      setUser({
        id: session.user.id,
        name: session.user.name || null,
        email: session.user.email || null,
        image: session.user.image || null,
        role: session.user.role || "user",
      });
    } else {
      setUser(null);
    }
    setLoading(false);
  }, [session, status]);

  return {
    user,
    loading,
    isAuthenticated: !!user,
  };
}

/**
 * Client-side hook to get full user profile
 * Fetches additional profile data from API
 */
export function useUserProfile() {
  const { user, loading: sessionLoading } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    // Fetch full profile
    fetch("/api/user/profile")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch profile");
        return res.json();
      })
      .then((data) => {
        setProfile(data.profile);
        setError(null);
      })
      .catch((err) => {
        console.error("Error fetching profile:", err);
        setError(err.message);
        // Fallback to basic user data
        setProfile({
          ...user,
          firstName: user.name?.split(" ")[0],
          lastName: user.name?.split(" ").slice(1).join(" "),
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user, sessionLoading]);

  return {
    profile,
    loading,
    error,
    user,
  };
}
