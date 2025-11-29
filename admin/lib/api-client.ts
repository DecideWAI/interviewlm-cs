/**
 * API Client for Admin Dashboard
 *
 * Centralized API client with error handling and type safety.
 */

import type {
  DashboardStats,
  DashboardExperiment,
  ExperimentListItem,
  SecurityAlert,
  AuditLogEntry,
  BlockedIp,
  CreateExperimentInput,
  UpdateExperimentInput,
  BlockIpInput,
} from './types';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `API Error: ${response.status}`);
  }

  return data.data;
}

// =============================================================================
// Dashboard
// =============================================================================

export async function fetchDashboardData(): Promise<{
  stats: DashboardStats;
  experiments: DashboardExperiment[];
}> {
  return fetchApi('/dashboard/stats');
}

// =============================================================================
// Experiments
// =============================================================================

export async function fetchExperiments(filter?: string): Promise<ExperimentListItem[]> {
  const params = filter && filter !== 'all' ? `?filter=${filter}` : '';
  return fetchApi(`/experiments${params}`);
}

export async function fetchExperiment(id: string): Promise<ExperimentListItem> {
  return fetchApi(`/experiments/${id}`);
}

export async function createExperiment(input: CreateExperimentInput): Promise<ExperimentListItem> {
  return fetchApi('/experiments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateExperiment(
  id: string,
  input: UpdateExperimentInput,
): Promise<ExperimentListItem> {
  return fetchApi(`/experiments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteExperiment(id: string): Promise<{ deleted: boolean }> {
  return fetchApi(`/experiments/${id}`, {
    method: 'DELETE',
  });
}

export async function startExperiment(id: string): Promise<ExperimentListItem> {
  return updateExperiment(id, { status: 'running' });
}

export async function pauseExperiment(id: string): Promise<ExperimentListItem> {
  return updateExperiment(id, { status: 'paused' });
}

export async function completeExperiment(id: string): Promise<ExperimentListItem> {
  return updateExperiment(id, { status: 'completed' });
}

// =============================================================================
// Security - Alerts
// =============================================================================

export async function fetchSecurityAlerts(options?: {
  acknowledged?: boolean;
  severity?: string;
  limit?: number;
}): Promise<SecurityAlert[]> {
  const params = new URLSearchParams();
  if (options?.acknowledged !== undefined) {
    params.set('acknowledged', String(options.acknowledged));
  }
  if (options?.severity) {
    params.set('severity', options.severity);
  }
  if (options?.limit) {
    params.set('limit', String(options.limit));
  }

  const queryString = params.toString();
  return fetchApi(`/security/alerts${queryString ? `?${queryString}` : ''}`);
}

export async function acknowledgeAlert(alertId: string): Promise<{ acknowledged: boolean }> {
  return fetchApi('/security/alerts', {
    method: 'POST',
    body: JSON.stringify({ alertId, action: 'acknowledge' }),
  });
}

// =============================================================================
// Security - Audit Logs
// =============================================================================

export async function fetchAuditLogs(options?: {
  userId?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.userId) params.set('userId', options.userId);
  if (options?.resourceType) params.set('resourceType', options.resourceType);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const queryString = params.toString();
  const response = await fetch(`${API_BASE}/security/audit${queryString ? `?${queryString}` : ''}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch audit logs');
  }

  return {
    entries: data.data,
    total: data.pagination?.total || 0,
  };
}

// =============================================================================
// Security - Blocked IPs
// =============================================================================

export async function fetchBlockedIps(): Promise<BlockedIp[]> {
  return fetchApi('/security/blocked-ips');
}

export async function blockIp(input: BlockIpInput): Promise<{ blocked: boolean }> {
  return fetchApi('/security/blocked-ips', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function unblockIp(ip: string): Promise<{ unblocked: boolean }> {
  return fetchApi(`/security/blocked-ips?ip=${encodeURIComponent(ip)}`, {
    method: 'DELETE',
  });
}
