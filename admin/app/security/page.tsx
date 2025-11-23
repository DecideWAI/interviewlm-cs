'use client';

import { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Ban,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  fetchSecurityAlerts,
  fetchAuditLogs,
  fetchBlockedIps,
  acknowledgeAlert as apiAcknowledgeAlert,
  blockIp as apiBlockIp,
  unblockIp as apiUnblockIp,
} from '@/lib/api-client';
import type { SecurityAlert, AuditLogEntry, BlockedIp } from '@/lib/types';

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<'alerts' | 'audit' | 'blocked'>('alerts');
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Block IP form state
  const [newIp, setNewIp] = useState('');
  const [newReason, setNewReason] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [alertsData, auditData, ipsData] = await Promise.all([
        fetchSecurityAlerts(),
        fetchAuditLogs(),
        fetchBlockedIps(),
      ]);

      setAlerts(alertsData);
      setAuditLogs(auditData.entries);
      setBlockedIps(ipsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security data');
      console.error('Security error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAcknowledge = async (alertId: string) => {
    try {
      await apiAcknowledgeAlert(alertId);
      setAlerts(alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleUnblock = async (ip: string) => {
    try {
      await apiUnblockIp(ip);
      setBlockedIps(blockedIps.filter((b) => b.ip !== ip));
    } catch (err) {
      console.error('Failed to unblock IP:', err);
    }
  };

  const handleBlockIp = async () => {
    if (!newIp || !newReason) return;

    try {
      await apiBlockIp({ ip: newIp, reason: newReason });
      setBlockedIps([...blockedIps, {
        ip: newIp,
        reason: newReason,
        blockedBy: 'admin',
        blockedAt: new Date().toISOString(),
      }]);
      setNewIp('');
      setNewReason('');
    } catch (err) {
      console.error('Failed to block IP:', err);
    }
  };

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Security</h1>
          <p className="text-text-tertiary mt-1">
            Monitor alerts, audit logs, and manage IP blocking
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-background-tertiary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-error/10 border border-error/20 rounded-lg text-error">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard
          icon={<AlertTriangle className="h-5 w-5 text-error" />}
          label="Active Alerts"
          value={unacknowledgedCount}
          bgColor="bg-error/10"
        />
        <StatsCard
          icon={<Shield className="h-5 w-5 text-success" />}
          label="Security Score"
          value={unacknowledgedCount === 0 ? '100/100' : `${Math.max(0, 100 - unacknowledgedCount * 10)}/100`}
          bgColor="bg-success/10"
        />
        <StatsCard
          icon={<Ban className="h-5 w-5 text-warning" />}
          label="Blocked IPs"
          value={blockedIps.length}
          bgColor="bg-warning/10"
        />
        <StatsCard
          icon={<Clock className="h-5 w-5 text-info" />}
          label="Audit Events (24h)"
          value={auditLogs.length}
          bgColor="bg-info/10"
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          <TabButton
            active={activeTab === 'alerts'}
            onClick={() => setActiveTab('alerts')}
            badge={unacknowledgedCount > 0 ? unacknowledgedCount : undefined}
          >
            Alerts
          </TabButton>
          <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')}>
            Audit Log
          </TabButton>
          <TabButton active={activeTab === 'blocked'} onClick={() => setActiveTab('blocked')}>
            Blocked IPs
          </TabButton>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary">
              No security alerts
            </div>
          ) : (
            alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={() => handleAcknowledge(alert.id)}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
          {auditLogs.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary">
              No audit logs found
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-background-tertiary">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase">
                    Resource
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-background-hover">
                    <td className="px-6 py-4 text-sm text-text-tertiary">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-text-primary">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {log.userEmail || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {log.resourceType}
                      {log.resourceId && (
                        <span className="text-text-muted">/{log.resourceId}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-text-tertiary">
                      {log.ipAddress || '—'}
                    </td>
                    <td className="px-6 py-4">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-error">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'blocked' && (
        <div className="space-y-4">
          {blockedIps.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary">
              No blocked IP addresses
            </div>
          ) : (
            blockedIps.map((blocked) => (
              <div
                key={blocked.ip}
                className="bg-background-secondary border border-border rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-error/10 rounded-lg">
                    <Ban className="h-5 w-5 text-error" />
                  </div>
                  <div>
                    <div className="font-mono text-text-primary">{blocked.ip}</div>
                    <div className="text-sm text-text-tertiary">{blocked.reason}</div>
                    <div className="text-xs text-text-muted mt-1">
                      Blocked by {blocked.blockedBy} on{' '}
                      {new Date(blocked.blockedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleUnblock(blocked.ip)}
                  className="px-3 py-1.5 text-sm bg-background-tertiary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                >
                  Unblock
                </button>
              </div>
            ))
          )}

          {/* Add IP Block Form */}
          <div className="bg-background-secondary border border-border rounded-lg p-6">
            <h3 className="text-lg font-medium text-text-primary mb-4">Block IP Address</h3>
            <div className="flex gap-4">
              <input
                type="text"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="Enter IP address"
                className="flex-1 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Reason for blocking"
                className="flex-1 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleBlockIp}
                disabled={!newIp || !newReason}
                className="px-4 py-2 bg-error text-white rounded-lg hover:bg-error/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Block IP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsCard({
  icon,
  label,
  value,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bgColor: string;
}) {
  return (
    <div className="bg-background-secondary border border-border rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>{icon}</div>
        <div>
          <div className="text-2xl font-semibold text-text-primary">{value}</div>
          <div className="text-sm text-text-tertiary">{label}</div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
  badge,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-text-tertiary hover:text-text-primary'
      }`}
    >
      {children}
      {badge !== undefined && (
        <span className="px-1.5 py-0.5 text-xs bg-error text-white rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}

function AlertCard({
  alert,
  onAcknowledge,
}: {
  alert: SecurityAlert;
  onAcknowledge: () => void;
}) {
  const severityColors = {
    critical: 'bg-error/10 border-error/30 text-error',
    high: 'bg-warning/10 border-warning/30 text-warning',
    medium: 'bg-info/10 border-info/30 text-info',
    low: 'bg-text-tertiary/10 border-text-tertiary/30 text-text-tertiary',
  };

  const severityIcons = {
    critical: <AlertTriangle className="h-5 w-5" />,
    high: <AlertTriangle className="h-5 w-5" />,
    medium: <Shield className="h-5 w-5" />,
    low: <Eye className="h-5 w-5" />,
  };

  return (
    <div
      className={`border rounded-lg p-4 ${
        alert.acknowledged
          ? 'bg-background-secondary border-border'
          : severityColors[alert.severity as keyof typeof severityColors]
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={alert.acknowledged ? 'text-text-tertiary' : ''}>
            {severityIcons[alert.severity as keyof typeof severityIcons]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded uppercase ${
                  severityColors[alert.severity as keyof typeof severityColors]
                }`}
              >
                {alert.severity}
              </span>
              <span className="text-xs text-text-muted">
                {new Date(alert.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="font-medium text-text-primary mt-1">{alert.message}</div>
            <div className="text-sm text-text-tertiary mt-1">
              {Object.entries(alert.details)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' • ')}
            </div>
          </div>
        </div>
        {!alert.acknowledged && (
          <button
            onClick={onAcknowledge}
            className="px-3 py-1.5 text-sm bg-background-tertiary border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
          >
            Acknowledge
          </button>
        )}
      </div>
    </div>
  );
}
