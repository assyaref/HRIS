"use client";

import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface OrganizationSelectOption {
  id: string;
  name: string;
  code: string;
  /** Inactive organizations stay selectable only when already assigned. */
  status?: string;
}

interface OrganizationSelectProps {
  /** Form field name — renders a hidden input carrying the selected id. */
  name?: string;
  label?: string;
  organizations: OrganizationSelectOption[];
  value: string;
  onChange: (organizationId: string) => void;
  disabled?: boolean;
  /** Hide the search box (e.g. very small option lists). */
  searchable?: boolean;
  emptyMessage?: string;
}

/**
 * Searchable Organization selector (client leaf).
 *
 * - Options come from the server (real `organizations` rows — never
 *   hardcoded); the selected value is validated again server-side on submit.
 * - Searchable by name or code so large tenant lists stay usable.
 * - Empty and error affordances: a clear empty state when there is nothing to
 *   select, and the surrounding form shows submit-time server errors.
 */
export function OrganizationSelect({
  name,
  label = "Organization",
  organizations,
  value,
  onChange,
  disabled = false,
  searchable = true,
  emptyMessage = "No active organizations found.",
}: OrganizationSelectProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return organizations;
    return organizations.filter(
      (organization) =>
        organization.name.toLowerCase().includes(normalized) ||
        organization.code.toLowerCase().includes(normalized)
    );
  }, [organizations, query]);

  const selected = organizations.find((org) => org.id === value) ?? null;

  return (
    <div className="space-y-2">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Label htmlFor={searchId}>{label}</Label>

      {searchable && organizations.length > 0 ? (
        <Input
          id={searchId}
          type="search"
          placeholder="Search organization…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
          autoComplete="off"
        />
      ) : null}

      {organizations.length === 0 ? (
        <p
          role="alert"
          className="border-input bg-background rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
        >
          {emptyMessage}
        </p>
      ) : filtered.length === 0 ? (
        <p className="border-input bg-background rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          No organizations match “{query.trim()}”.
        </p>
      ) : (
        <div
          role="listbox"
          aria-label={label}
          className="border-input bg-background max-h-44 overflow-y-auto rounded-md border"
        >
          {filtered.map((organization) => {
            const isSelected = organization.id === value;
            return (
              <button
                key={organization.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => onChange(organization.id)}
                className={
                  isSelected
                    ? "bg-primary text-primary-foreground flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                    : "hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                }
              >
                <span className="min-w-0 truncate">{organization.name}</span>
                <span
                  className={
                    isSelected
                      ? "text-primary-foreground/80 shrink-0 font-mono text-xs"
                      : "text-muted-foreground shrink-0 font-mono text-xs"
                  }
                >
                  {organization.code}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <p className="text-muted-foreground text-xs">
          Selected: <span className="font-medium text-foreground">{selected.name}</span>{" "}
          <span className="font-mono">({selected.code})</span>
          {selected.status && selected.status !== "active" ? (
            <span className="text-destructive"> — inactive organization</span>
          ) : null}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Select the organization this project belongs to.
        </p>
      )}
    </div>
  );
}
