"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { IconSearch } from "@/components/icons";
import { NAV_ICONS } from "@/components/icons";
import { useEscape, useFocusTrap } from "@/hooks/use-focus-trap";
import { useLockedBody } from "@/hooks/use-locked-body";
import { Portal } from "@/components/overlays/portal";
import { useAuthContext } from "@/features/auth/authorization/authorization-context";
import { searchRecords } from "@/features/shared/api/shared-api";
import { sharedKeys } from "@/features/shared/api/query-keys";
import { hrefForSearchHit } from "@/features/shared/api/search-href";
import { isNotFoundError, isNetworkError, queryErrorMessage } from "@/lib/api/query-error";
import { filterNavTree } from "./filter-nav";
import { useWorkspaceShell } from "./shell-context";

type PaletteRow =
  | { kind: "nav"; id: string; label: string; group: string; href: string; icon: keyof typeof NAV_ICONS }
  | { kind: "search"; id: string; label: string; group: string; href: string | null };

/**
 * Command palette — navigation + GET /search?q= entity hits (Document 5 §10.2).
 * ⌘K / Ctrl+K follows Document 2's assumed default; the exact keybinding
 * remains an open product decision (Doc B3 §18 / §27).
 */
export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useWorkspaceShell();
  const auth = useAuthContext();
  const router = useRouter();
  const trapRef = useFocusTrap(commandOpen);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(() => {
    setQuery("");
    setDebounced("");
    setActiveIndex(0);
    setCommandOpen(false);
  }, [setCommandOpen]);

  useLockedBody(commandOpen);
  useEscape(commandOpen, close);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const groups = useMemo(() => filterNavTree(auth), [auth]);
  const navRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.flatMap((group) =>
      group.items
        .filter(
          (item) =>
            !q ||
            item.label.toLowerCase().includes(q) ||
            group.label.toLowerCase().includes(q)
        )
        .map(
          (item): PaletteRow => ({
            kind: "nav",
            id: `nav-${item.id}`,
            label: item.label,
            group: group.label,
            href: item.href,
            icon: item.icon,
          })
        )
    );
  }, [groups, query]);

  const searchEnabled = debounced.length >= 2;
  const search = useQuery({
    queryKey: sharedKeys.search(debounced),
    queryFn: () => searchRecords(debounced),
    enabled: commandOpen && searchEnabled,
  });

  const searchRows: PaletteRow[] = useMemo(() => {
    if (!searchEnabled || !search.isSuccess) return [];
    return search.data.map((hit) => ({
      kind: "search" as const,
      id: `search-${hit.entityType ?? "record"}-${hit.id}`,
      label: hit.title,
      group: hit.entityType ? hit.entityType : "Result",
      href: hrefForSearchHit(hit),
    }));
  }, [search.data, search.isSuccess, searchEnabled]);

  const results = useMemo(() => [...navRows, ...searchRows], [navRows, searchRows]);
  const safeActiveIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (commandOpen) close();
      else setCommandOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, commandOpen, setCommandOpen]);

  if (!commandOpen) return null;

  function go(href: string | null) {
    if (!href) return;
    close();
    router.push(href);
  }

  const searchStatus = !searchEnabled
    ? null
    : search.isPending
      ? "Searching…"
      : search.isError && isNotFoundError(search.error)
        ? "Search service is not currently available."
        : search.isError && isNetworkError(search.error)
          ? queryErrorMessage(search.error)
          : search.isError
            ? queryErrorMessage(search.error)
            : search.isSuccess && search.data.length === 0
              ? "No matching records"
              : null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[var(--z-command-palette)] flex items-start justify-center px-4 pt-[15vh]">
        <button
          type="button"
          className="absolute inset-0 cursor-default bg-ink/50"
          aria-label="Close command palette"
          onClick={close}
        />
        <div
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="relative w-full max-w-[40rem] overflow-hidden rounded-2xl border border-steel/15 bg-paper-elev shadow-[var(--elevation-3)]"
        >
          <div className="flex items-center gap-2 border-b border-steel/15 px-4">
            <IconSearch size={16} className="text-steel" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              placeholder="Go to a page or search records…"
              aria-label="Search navigation and records"
              aria-controls="command-palette-results"
              aria-activedescendant={
                results[safeActiveIndex] ? `command-${results[safeActiveIndex].id}` : undefined
              }
              className="font-display h-12 w-full bg-transparent text-[length:var(--text-body-size)] text-ink outline-none placeholder:font-mono placeholder:text-[length:var(--text-metadata-size)] placeholder:text-steel"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    results.length === 0 ? 0 : (index - 1 + results.length) % results.length
                  );
                }
                if (event.key === "Enter") {
                  const selected = results[safeActiveIndex];
                  if (selected) go(selected.href);
                }
              }}
            />
          </div>
          {searchStatus ? (
            <p className="type-helper border-b border-steel/10 px-4 py-2 text-steel" role="status">
              {searchStatus}
            </p>
          ) : null}
          <ul id="command-palette-results" role="listbox" className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 ? (
              <li className="type-body px-4 py-6 text-steel">
                {searchEnabled
                  ? "No matching pages"
                  : "Type to filter pages, or enter 2+ characters to search records."}
              </li>
            ) : (
              results.map((result, index) => {
                const active = index === safeActiveIndex;
                const Icon = result.kind === "nav" ? NAV_ICONS[result.icon] : IconSearch;
                const disabled = result.href === null;
                return (
                  <li key={result.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`command-${result.id}`}
                      aria-selected={active}
                      disabled={disabled}
                      className={cn(
                        "relative flex min-h-10 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left",
                        active && "bg-steel/[0.08]",
                        disabled && "cursor-not-allowed opacity-50"
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(result.href)}
                    >
                      {active ? (
                        <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-ember-deep" aria-hidden="true" />
                      ) : null}
                      <Icon size={16} className="text-steel" />
                      <span className="font-display text-[length:var(--text-body-size)] text-ink">
                        {result.label}
                      </span>
                      <span className="type-metadata ml-auto text-steel">{result.group}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </Portal>
  );
}
