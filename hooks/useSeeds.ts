/**
 * Custom hook for managing problem seeds
 * Replaces mock data with real API calls
 */

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export interface ProblemSeed {
  id: string;
  title: string;
  description: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  category: string;
  tags: string[];
  topics: string[];
  language: string;
  status: 'active' | 'draft' | 'archived';
  estimatedTime: number;
  usageCount: number;
  avgCandidateScore: number | null;
  isSystemSeed: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  parentSeedId: string | null;
  starterCode?: string | null;
  testCode?: string | null;
  instructions?: string | null;
}

export interface SeedStats {
  totalSeeds: number;
  activeSeeds: number;
  draftSeeds: number;
  systemSeeds: number;
  customSeeds: number;
  avgUsageCount: number;
  avgCandidateScore: number;
}

interface UseSeedsOptions {
  status?: string;
  category?: string;
  includeSystem?: boolean;
}

export function useSeeds(options: UseSeedsOptions = {}) {
  const { data: session } = useSession();
  const [seeds, setSeeds] = useState<ProblemSeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeeds = async () => {
    if (!session?.user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (options.status) params.append('status', options.status);
      if (options.category) params.append('category', options.category);
      if (options.includeSystem !== undefined) {
        params.append('includeSystem', String(options.includeSystem));
      }

      const response = await fetch(`/api/seeds?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch seeds: ${response.statusText}`);
      }

      const data = await response.json();
      setSeeds(data.seeds || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch seeds');
      console.error('[useSeeds] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeeds();
  }, [session?.user, options.status, options.category, options.includeSystem]);

  const refetch = () => {
    fetchSeeds();
  };

  return {
    seeds,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook to get a single seed by ID
 */
export function useSeed(id: string | null) {
  const { data: session } = useSession();
  const [seed, setSeed] = useState<ProblemSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user || !id) {
      setLoading(false);
      return;
    }

    const fetchSeed = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/seeds/${id}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch seed: ${response.statusText}`);
        }

        const data = await response.json();
        setSeed(data.seed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch seed');
        console.error('[useSeed] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSeed();
  }, [session?.user, id]);

  return {
    seed,
    loading,
    error,
  };
}

/**
 * Calculate statistics from seeds
 */
export function calculateSeedStats(seeds: ProblemSeed[]): SeedStats {
  const totalSeeds = seeds.length;
  const activeSeeds = seeds.filter((s) => s.status === 'active').length;
  const draftSeeds = seeds.filter((s) => s.status === 'draft').length;
  const systemSeeds = seeds.filter((s) => s.isSystemSeed).length;
  const customSeeds = seeds.filter((s) => !s.isSystemSeed).length;

  const totalUsage = seeds.reduce((sum, s) => sum + s.usageCount, 0);
  const avgUsageCount = totalSeeds > 0 ? totalUsage / totalSeeds : 0;

  const scoresWithValues = seeds.filter(
    (s) => s.avgCandidateScore !== null
  ) as (ProblemSeed & { avgCandidateScore: number })[];
  const totalScore = scoresWithValues.reduce(
    (sum, s) => sum + s.avgCandidateScore,
    0
  );
  const avgCandidateScore =
    scoresWithValues.length > 0 ? totalScore / scoresWithValues.length : 0;

  return {
    totalSeeds,
    activeSeeds,
    draftSeeds,
    systemSeeds,
    customSeeds,
    avgUsageCount,
    avgCandidateScore,
  };
}

/**
 * Hook to create a new seed
 */
export function useCreateSeed() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSeed = async (data: Partial<ProblemSeed>) => {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create seed');
      }

      const result = await response.json();
      return result.seed;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create seed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  return {
    createSeed,
    creating,
    error,
  };
}

/**
 * Hook to update a seed
 */
export function useUpdateSeed(id: string) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSeed = async (data: Partial<ProblemSeed>) => {
    setUpdating(true);
    setError(null);

    try {
      const response = await fetch(`/api/seeds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update seed');
      }

      const result = await response.json();
      return result.seed;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update seed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  return {
    updateSeed,
    updating,
    error,
  };
}

/**
 * Hook to delete a seed
 */
export function useDeleteSeed() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteSeed = async (id: string) => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/seeds/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete seed');
      }

      return await response.json();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete seed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  return {
    deleteSeed,
    deleting,
    error,
  };
}

/**
 * Hook to clone a seed
 */
export function useCloneSeed() {
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cloneSeed = async (id: string, options?: { title?: string }) => {
    setCloning(true);
    setError(null);

    try {
      const response = await fetch(`/api/seeds/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clone seed');
      }

      const result = await response.json();
      return result.seed;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to clone seed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setCloning(false);
    }
  };

  return {
    cloneSeed,
    cloning,
    error,
  };
}
