"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
}

export function Tabs({
  tabs,
  value,
  onChange,
  labelledBy,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  labelledBy?: string;
}) {
  return (
    <div role="tablist" aria-labelledby={labelledBy} className="flex gap-1 border-b border-steel/15">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            className={cn(
              "font-display relative min-h-10 cursor-pointer px-3 text-[length:var(--text-body-size)] font-semibold",
              selected ? "text-ink" : "text-steel hover:text-ink"
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {selected ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 bg-ember-deep" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: React.ReactNode;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="pt-4">
      {children}
    </div>
  );
}
