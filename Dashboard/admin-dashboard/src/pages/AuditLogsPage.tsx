import { useEffect, useState, useMemo } from 'react';
import {
  ScrollText,
  Search,
  Eye,
  Calendar,
  User,
  Clock,
  Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getRestaurantId, PERMISSION_LABELS } from '../lib/constants';
import type { AuditLog, PermissionKey } from '../types';
import { Card } from '../components/ui/Card';
import { Table, Thead, Th, Tbody, Tr, Td } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

// ─── Constants & Dictionaries ──────────────────────────────

const ENTITY_CONFIG: Record<string, { label: string; icon: string }> = {
  categories: { label: 'Categories', icon: '📁' },
  products: { label: 'Products', icon: '🍔' },
  product_variants: { label: 'Variants & Pricing', icon: '🏷️' },
  restaurant_users: { label: 'Administrators', icon: '👤' },
  admin_permissions: { label: 'Permissions', icon: '🛡️' },
};

const ACTION_CONFIG: Record<
  string,
  {
    label: string;
    variant: 'success' | 'accent' | 'danger' | 'warning' | 'default';
  }
> = {
  INSERT: { label: 'Create', variant: 'success' },
  UPDATE: { label: 'Update', variant: 'accent' },
  DELETE: { label: 'Delete', variant: 'danger' },
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  is_available: 'Availability',
  is_active: 'Status',
  sort_order: 'Display Order',
  price: 'Price',
  username: 'Username',
  role: 'Role',
  category_id: 'Category ID',
  product_id: 'Product ID',
  permission: 'Permission',
  permissions: 'Permissions',
  event: 'Event',
};

const IGNORED_KEYS = new Set(['id', 'restaurant_id', 'created_at', 'updated_at']);

// ─── Formatting Helpers ────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function getTargetItemName(log: AuditLog): string {
  const data = (log.new_data || log.old_data || {}) as Record<string, unknown>;
  if (typeof data.name === 'string' && data.name.trim()) return data.name;
  if (typeof data.username === 'string' && data.username.trim()) return data.username;
  if (typeof data.permission === 'string') {
    return PERMISSION_LABELS[data.permission as PermissionKey] || data.permission;
  }
  if (typeof data.target_username === 'string') return data.target_username;
  if (log.entity_id) return `${log.entity_id.slice(0, 8)}...`;
  return '—';
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';

  if (key === 'is_available') {
    return value ? 'Available' : 'Unavailable';
  }
  if (key === 'is_active') {
    return value ? 'Active' : 'Inactive';
  }
  if (key === 'price') {
    return `€${Number(value).toFixed(2)}`;
  }
  if (key === 'role') {
    return value === 'owner' ? 'Owner' : 'Administrator';
  }
  if (key === 'permission') {
    return PERMISSION_LABELS[value as PermissionKey] || String(value);
  }
  if (key === 'permissions' && Array.isArray(value)) {
    if (value.length === 0) return 'No permissions';
    return value
      .map((p) => PERMISSION_LABELS[p as PermissionKey] || String(p))
      .join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

interface FieldDiff {
  key: string;
  label: string;
  oldVal: unknown;
  newVal: unknown;
  oldFormatted: string;
  newFormatted: string;
}

function getFieldDiffs(log: AuditLog): FieldDiff[] {
  const oldData = (log.old_data || {}) as Record<string, unknown>;
  const newData = (log.new_data || {}) as Record<string, unknown>;

  if (log.action === 'UPDATE') {
    const allKeys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    const diffs: FieldDiff[] = [];

    for (const key of allKeys) {
      if (IGNORED_KEYS.has(key)) continue;
      const oldVal = oldData[key];
      const newVal = newData[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diffs.push({
          key,
          label: FIELD_LABELS[key] || key,
          oldVal,
          newVal,
          oldFormatted: formatFieldValue(key, oldVal),
          newFormatted: formatFieldValue(key, newVal),
        });
      }
    }
    return diffs;
  }

  if (log.action === 'INSERT') {
    const diffs: FieldDiff[] = [];
    for (const key of Object.keys(newData)) {
      if (IGNORED_KEYS.has(key)) continue;
      diffs.push({
        key,
        label: FIELD_LABELS[key] || key,
        oldVal: null,
        newVal: newData[key],
        oldFormatted: '—',
        newFormatted: formatFieldValue(key, newData[key]),
      });
    }
    return diffs;
  }

  if (log.action === 'DELETE') {
    const diffs: FieldDiff[] = [];
    for (const key of Object.keys(oldData)) {
      if (IGNORED_KEYS.has(key)) continue;
      diffs.push({
        key,
        label: FIELD_LABELS[key] || key,
        oldVal: oldData[key],
        newVal: null,
        oldFormatted: formatFieldValue(key, oldData[key]),
        newFormatted: '—',
      });
    }
    return diffs;
  }

  return [];
}

// ─── Details Modal ─────────────────────────────────────────

function AuditDetailsModal({
  log,
  performer,
  onClose,
}: {
  log: AuditLog | null;
  performer?: { username: string; role: string } | null;
  onClose: () => void;
}) {

  if (!log) return null;

  const actionCfg = ACTION_CONFIG[log.action] ?? {
    label: log.action,
    variant: 'default' as const,
  };
  const entityCfg = ENTITY_CONFIG[log.entity_type] ?? {
    label: log.entity_type,
    icon: '📄',
  };
  const targetItem = getTargetItemName(log);
  const diffs = getFieldDiffs(log);

  return (
    <Modal
      open={!!log}
      onClose={onClose}
      title="Audit Event Details"
      maxWidth="max-w-2xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Top Summary Card */}
        <div className="bg-[var(--color-surface-2)]/60 rounded-[var(--radius-lg)] p-4 border border-[var(--color-border)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Performer */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text)]">
                <User size={16} />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-3)] font-medium">Performer</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-bold text-[var(--color-text)]">
                    {performer?.username || (log.user_id ? 'Administrator' : 'System')}
                  </span>
                  {performer && (
                    <Badge variant={performer.role === 'owner' ? 'accent' : 'default'}>
                      {performer.role === 'owner' ? 'Owner' : 'Administrator'}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Date & Time */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text)]">
                <Calendar size={16} />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-3)] font-medium">Date & Time</p>
                <p className="text-xs font-semibold text-[var(--color-text)] mt-0.5">
                  {formatDate(log.created_at)}
                </p>
              </div>
            </div>

            {/* Entity & Action */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text)]">
                <Layers size={16} />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-3)] font-medium">Action & Target</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={actionCfg.variant}>{actionCfg.label}</Badge>
                  <span className="text-xs font-semibold text-[var(--color-text-2)]">
                    {entityCfg.icon} {entityCfg.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Target Item */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text)]">
                <Clock size={16} />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-3)] font-medium">Affected Item</p>
                <p className="text-sm font-bold text-[var(--color-text)] mt-0.5 truncate">
                  {targetItem}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Changes Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <span>Recorded Changes</span>
              <span className="text-xs font-normal text-[var(--color-text-3)]">
                ({diffs.length} {diffs.length === 1 ? 'field' : 'fields'})
              </span>
            </h4>
          </div>

          {diffs.length === 0 ? (
            <div className="py-6 text-center text-sm text-[var(--color-text-3)] bg-[var(--color-surface-2)]/30 rounded-[var(--radius-md)]">
              No specific field details available for this record.
            </div>
          ) : log.action === 'UPDATE' ? (
            <div className="space-y-2.5">
              {diffs.map((diff) => (
                <div
                  key={diff.key}
                  className="p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <p className="text-xs font-bold text-[var(--color-text-2)] mb-2">
                    {diff.label}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {/* Old Value */}
                    <div className="p-2 rounded bg-[var(--color-danger-bg)]/40 border border-[var(--color-danger)]/20 text-[var(--color-danger)] flex items-center justify-between">
                      <span className="font-medium text-[11px] opacity-75">Before:</span>
                      <span className="font-semibold line-through">{diff.oldFormatted}</span>
                    </div>

                    {/* New Value */}
                    <div className="p-2 rounded bg-[var(--color-success-bg)]/40 border border-[var(--color-success)]/20 text-[var(--color-success)] flex items-center justify-between">
                      <span className="font-medium text-[11px] opacity-75">After:</span>
                      <span className="font-bold">{diff.newFormatted}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : log.action === 'INSERT' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {diffs.map((diff) => (
                <div
                  key={diff.key}
                  className="p-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between text-xs"
                >
                  <span className="text-[var(--color-text-2)] font-medium">{diff.label}:</span>
                  <span className="font-bold text-[var(--color-text)]">{diff.newFormatted}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {diffs.map((diff) => (
                <div
                  key={diff.key}
                  className="p-2.5 rounded-[var(--radius-md)] border border-[var(--color-danger)]/20 bg-[var(--color-danger-bg)]/20 flex items-center justify-between text-xs text-[var(--color-danger)]"
                >
                  <span className="font-medium">{diff.label}:</span>
                  <span className="font-bold line-through">{diff.oldFormatted}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ─────────────────────────────────────

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, { username: string; role: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');

  // Selected Log for Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');

      const restaurantId = getRestaurantId();
      const { data, error: err } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(300);

      if (err) {
        setError('Failed to load audit logs. Please try again.');
      } else {
        const rawLogs = (data as AuditLog[]) ?? [];
        setLogs(rawLogs);

        // Resolve usernames from restaurant_users where user_id = audit_logs.user_id
        const userIds = Array.from(
          new Set(rawLogs.map((l) => l.user_id).filter((id): id is string => Boolean(id)))
        );

        if (userIds.length > 0) {
          const { data: usersData } = await supabase
            .from('restaurant_users')
            .select('user_id, username, role')
            .eq('restaurant_id', restaurantId)
            .in('user_id', userIds);

          if (usersData) {
            const map: Record<string, { username: string; role: string }> = {};
            for (const u of usersData) {
              map[u.user_id] = { username: u.username, role: u.role };
            }
            setUsersMap(map);
          }
        }
      }

      setLoading(false);
    }

    load();
  }, []);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Entity filter
      if (selectedEntity !== 'ALL' && log.entity_type !== selectedEntity) {
        return false;
      }
      // Action filter
      if (selectedAction !== 'ALL' && log.action !== selectedAction) {
        return false;
      }
      // Text search (matches username or target item name)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const username = log.user_id ? usersMap[log.user_id]?.username?.toLowerCase() : 'system';
        const targetName = getTargetItemName(log).toLowerCase();
        const entityLabel = (ENTITY_CONFIG[log.entity_type]?.label || log.entity_type).toLowerCase();

        return (
          username?.includes(query) ||
          targetName.includes(query) ||
          entityLabel.includes(query)
        );
      }
      return true;
    });
  }, [logs, selectedEntity, selectedAction, searchQuery, usersMap]);

  return (
    <div className="max-w-6xl mx-auto space-y-5" data-aos="fade-up">
      <Card padding={false} className="overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[var(--color-border)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-accent)] flex items-center justify-center text-white">
                  <ScrollText size={17} />
                </div>
                <h1 className="text-xl font-bold text-[var(--color-text)]">Audit Logs</h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-accent-bg)] text-[var(--color-accent)]">
                  {logs.length} logged events
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-2)] mt-1">
                Complete and tamper-evident audit trail of all changes made across the system
              </p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search */}
            <div className="relative">
              <Input
                id="audit-search"
                placeholder="Search by item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search size={15} className="text-[var(--color-text-3)]" />}
              />
            </div>

            {/* Entity Filter */}
            <div>
              <select
                aria-label="Data Type"
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value)}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
              >
                <option value="ALL">All Data Types</option>
                <option value="categories">Categories</option>
                <option value="products">Products</option>
                <option value="product_variants">Variants & Pricing</option>
                <option value="restaurant_users">Administrators</option>
                <option value="admin_permissions">Permissions</option>
              </select>
            </div>

            {/* Action Filter */}
            <div>
              <select
                aria-label="Action"
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
              >
                <option value="ALL">All Actions</option>
                <option value="INSERT">Create (INSERT)</option>
                <option value="UPDATE">Update (UPDATE)</option>
                <option value="DELETE">Delete (DELETE)</option>
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <span className="w-7 h-7 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-6">
            <p className="text-sm text-[var(--color-danger)] text-center font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="py-16 text-center">
            <ScrollText size={38} className="mx-auto text-[var(--color-text-3)] mb-2" />
            <p className="text-base font-bold text-[var(--color-text)]">No audit logs recorded yet</p>
            <p className="text-sm text-[var(--color-text-3)] mt-1">
              Any insert, update, or delete operations performed by staff will be tracked here.
            </p>
          </div>
        )}

        {!loading && !error && logs.length > 0 && filteredLogs.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--color-text-3)]">
            No events match your current search and filter criteria.
          </div>
        )}

        {!loading && !error && filteredLogs.length > 0 && (
          <Table>
            <Thead>
              <tr>
                <Th className="w-36">User</Th>
                <Th className="w-24 text-center">Action</Th>
                <Th className="w-36">Data Type</Th>
                <Th>Affected Item</Th>
                <Th className="w-44">Date & Time</Th>
                <Th className="w-24 text-right">Details</Th>
              </tr>
            </Thead>

            <Tbody>
              {filteredLogs.map((log) => {
                const actionCfg = ACTION_CONFIG[log.action] ?? {
                  label: log.action,
                  variant: 'default' as const,
                };
                const entityCfg = ENTITY_CONFIG[log.entity_type] ?? {
                  label: log.entity_type,
                  icon: '📄',
                };
                const userInfo = log.user_id ? usersMap[log.user_id] : null;
                const targetItem = getTargetItemName(log);

                return (
                  <Tr
                    key={log.id}
                    className="cursor-pointer hover:bg-[var(--color-surface-2)]/70 transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    {/* Performer */}
                    <Td className="w-36">
                      {userInfo ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-[var(--color-text)]">
                            {userInfo.username}
                          </span>
                          <Badge variant={userInfo.role === 'owner' ? 'accent' : 'default'}>
                            {userInfo.role === 'owner' ? 'Owner' : 'Admin'}
                          </Badge>
                        </div>
                      ) : log.user_id ? (
                        <span className="text-xs font-mono text-[var(--color-text-2)]">
                          Admin ({log.user_id.slice(0, 6)})
                        </span>
                      ) : (
                        <span className="text-sm text-[var(--color-text-3)] font-medium">
                          System
                        </span>
                      )}
                    </Td>

                    {/* Action */}
                    <Td className="w-24 text-center">
                      <Badge variant={actionCfg.variant}>{actionCfg.label}</Badge>
                    </Td>

                    {/* Entity */}
                    <Td className="w-36">
                      <span className="text-xs font-medium text-[var(--color-text-2)] flex items-center gap-1">
                        <span>{entityCfg.icon}</span>
                        <span>{entityCfg.label}</span>
                      </span>
                    </Td>

                    {/* Target Item */}
                    <Td>
                      <p className="text-sm font-semibold text-[var(--color-text)] truncate max-w-xs">
                        {targetItem}
                      </p>
                    </Td>

                    {/* Date */}
                    <Td className="w-44">
                      <span className="text-xs text-[var(--color-text-3)] font-medium whitespace-nowrap">
                        {formatShortDate(log.created_at)}
                      </span>
                    </Td>

                    {/* Details Button */}
                    <Td className="w-24 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        aria-label="View Details"
                        className="text-[var(--color-accent)] hover:text-[var(--color-accent-h)] hover:bg-[var(--color-accent-bg)]"
                      >
                        <Eye size={14} className="mr-1" />
                        <span>View</span>
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>

      {/* Details Modal */}
      <AuditDetailsModal
        log={selectedLog}
        performer={selectedLog?.user_id ? usersMap[selectedLog.user_id] : null}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}