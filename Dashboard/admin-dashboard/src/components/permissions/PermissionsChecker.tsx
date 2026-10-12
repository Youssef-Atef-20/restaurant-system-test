import type { PermissionKey } from '../../types';
import { PERMISSION_GROUPS, PERMISSION_LABELS } from '../../lib/constants';

interface PermissionsCheckerProps {
  selected: Set<PermissionKey>;
  onChange: (permissions: Set<PermissionKey>) => void;
  disabled?: boolean;
}

export function PermissionsChecker({
  selected,
  onChange,
  disabled,
}: PermissionsCheckerProps) {
  function toggle(key: PermissionKey) {
    const next = new Set(selected);

    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    onChange(next);
  }

  function toggleGroup(keys: PermissionKey[], allChecked: boolean) {
    const next = new Set(selected);

    if (allChecked) {
      keys.forEach((key) => next.delete(key));
    } else {
      keys.forEach((key) => next.add(key));
    }

    onChange(next);
  }

  return (
    <div className="w-full space-y-3.5">
      {PERMISSION_GROUPS.map((group) => {
        const checkedCount = group.keys.filter((key) => selected.has(key)).length;
        const allChecked = checkedCount === group.keys.length;
        const someChecked = !allChecked && checkedCount > 0;
        const groupId = `group-${group.label}`;

        return (
          <div
            key={group.label}
            className="
              w-full
              rounded-[var(--radius-md)]
              border border-[var(--color-border)]
              bg-[var(--color-surface)]
              overflow-hidden
            "
          >
            {/* Group header with Select All */}
            <div
              className="
                flex items-center justify-between
                w-full
                px-4 py-2.5 sm:py-3
                border-b border-[var(--color-border)]
                bg-[var(--color-surface-2)]
              "
            >
              <label
                htmlFor={groupId}
                className="flex items-center gap-2.5 cursor-pointer select-none min-w-0"
              >
                <input
                  id={groupId}
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = someChecked;
                    }
                  }}
                  onChange={() => toggleGroup(group.keys, allChecked)}
                  disabled={disabled}
                  className="
                    w-4 h-4
                    shrink-0
                    rounded
                    accent-[var(--color-accent)]
                    cursor-pointer
                    disabled:cursor-not-allowed
                  "
                />

                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {group.label}
                </span>
              </label>

              <span className="text-xs text-[var(--color-text-3)] font-normal shrink-0">
                {checkedCount === group.keys.length
                  ? 'All selected'
                  : checkedCount > 0
                  ? `${checkedCount} of ${group.keys.length}`
                  : 'Select all'}
              </span>
            </div>

            {/* Individual permissions */}
            <div className="p-2 sm:p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
              {group.keys.map((key) => {
                const permissionId = `perm-${key}`;
                const isChecked = selected.has(key);

                return (
                  <label
                    key={key}
                    htmlFor={permissionId}
                    className={`
                      flex items-center gap-2.5
                      min-w-0
                      px-3 py-2.5
                      rounded-[var(--radius-sm)]
                      border transition-colors duration-150
                      cursor-pointer select-none
                      ${
                        isChecked
                          ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-bg)] text-[var(--color-text)]'
                          : 'border-transparent hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)]'
                      }
                      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    <input
                      id={permissionId}
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(key)}
                      disabled={disabled}
                      className="
                        w-4 h-4
                        shrink-0
                        rounded
                        accent-[var(--color-accent)]
                        cursor-pointer
                        disabled:cursor-not-allowed
                      "
                    />

                    <span className="text-sm leading-5 font-medium min-w-0 break-words">
                      {PERMISSION_LABELS[key]}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}