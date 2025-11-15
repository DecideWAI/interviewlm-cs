"use client";

import { useState, useRef, useEffect } from "react";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function OrganizationSwitcher() {
  const {
    organizations,
    activeOrganization,
    loading,
    switchOrganization,
  } = useOrganization();

  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSwitch = async (orgId: string) => {
    if (orgId === activeOrganization?.id) {
      setIsOpen(false);
      return;
    }

    setSwitching(true);
    await switchOrganization(orgId);
    setSwitching(false);
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-background-tertiary rounded-md">
        <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
        <span className="text-sm text-text-secondary">Loading...</span>
      </div>
    );
  }

  if (!activeOrganization) {
    return (
      <Link
        href="/onboarding"
        className="flex items-center gap-2 px-3 py-2 bg-background-tertiary border border-border-secondary rounded-md hover:bg-background-hover transition-colors"
      >
        <Plus className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-text-primary">
          Create Organization
        </span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={switching}
        className={cn(
          "flex items-center gap-2 px-3 py-2 bg-background-tertiary border border-border rounded-md hover:bg-background-hover hover:border-border-hover transition-all min-w-[200px]",
          isOpen && "bg-background-hover border-border-hover"
        )}
      >
        <Building2 className="h-4 w-4 text-text-tertiary flex-shrink-0" />
        <div className="flex-1 text-left overflow-hidden">
          <p className="text-sm font-medium text-text-primary truncate">
            {activeOrganization.name}
          </p>
          <p className="text-xs text-text-tertiary">
            {organizations.length} organization{organizations.length !== 1 ? "s" : ""}
          </p>
        </div>
        {switching ? (
          <Loader2 className="h-4 w-4 animate-spin text-text-tertiary flex-shrink-0" />
        ) : (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-text-tertiary flex-shrink-0 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[280px] bg-background-secondary border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Active Organization */}
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
              Current Organization
            </p>
            <div className="flex items-start gap-2 p-2 bg-background-tertiary rounded-md">
              <Building2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {activeOrganization.name}
                  </p>
                  <Badge variant="primary" className="text-xs">
                    {activeOrganization.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {activeOrganization.credits} credits
                  </span>
                  <Badge variant="default" className="text-xs">
                    {activeOrganization.plan}
                  </Badge>
                </div>
              </div>
              <Check className="h-5 w-5 text-success flex-shrink-0" />
            </div>
          </div>

          {/* Other Organizations */}
          {organizations.length > 1 && (
            <div className="p-2">
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide px-2 py-1.5">
                Switch Organization
              </p>
              <div className="space-y-1">
                {organizations
                  .filter((org) => org.id !== activeOrganization.id)
                  .map((org) => (
                    <button
                      key={org.id}
                      onClick={() => handleSwitch(org.id)}
                      disabled={switching}
                      className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-background-tertiary transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Building2 className="h-4 w-4 text-text-tertiary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {org.name}
                          </p>
                          <Badge variant="default" className="text-xs">
                            {org.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-secondary">
                          <span>{org.credits} credits</span>
                          <span>•</span>
                          <span>{org.plan}</span>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="border-t border-border p-2">
            <Link
              href="/settings?tab=team"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-tertiary rounded-md transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Manage Organizations</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
