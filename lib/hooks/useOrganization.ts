"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits: number;
  role: string;
}

/**
 * Client-side hook to manage user's organizations and active organization
 */
export function useOrganization() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      const response = await fetch("/api/user/organizations");

      if (!response.ok) {
        throw new Error("Failed to fetch organizations");
      }

      const data = await response.json();
      setOrganizations(data.organizations || []);
    } catch (err) {
      console.error("Error fetching organizations:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  // Fetch active organization
  const fetchActiveOrganization = useCallback(async () => {
    try {
      const response = await fetch("/api/user/active-organization");

      if (!response.ok) {
        throw new Error("Failed to fetch active organization");
      }

      const data = await response.json();
      setActiveOrganization(data.organization);
    } catch (err) {
      console.error("Error fetching active organization:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  // Switch active organization
  const switchOrganization = useCallback(
    async (organizationId: string) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/user/active-organization", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to switch organization");
        }

        const data = await response.json();
        setActiveOrganization(data.organization);

        // Refresh the page to reload data with new organization context
        router.refresh();
      } catch (err) {
        console.error("Error switching organization:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchOrganizations(), fetchActiveOrganization()]);
      setLoading(false);
    };

    loadData();
  }, [fetchOrganizations, fetchActiveOrganization]);

  return {
    organizations,
    activeOrganization,
    loading,
    error,
    switchOrganization,
    refetch: async () => {
      await Promise.all([fetchOrganizations(), fetchActiveOrganization()]);
    },
  };
}
