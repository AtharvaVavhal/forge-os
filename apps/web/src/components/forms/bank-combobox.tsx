"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { searchBanks } from "@/features/shared/api/bank-directory-api";
import { sharedKeys } from "@/features/shared/api/query-keys";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * K10 — accessible searchable bank-name combobox. A real text input
 * underneath (same `id`/`name` as before), so it stays a plain form field:
 * `FormData`/`document.getElementById(id).value` keep working unchanged,
 * and "Bank Name" remains free text — picking a suggestion just fills it in.
 */
export function BankCombobox({
  id,
  name,
  value,
  onChange,
  invalid,
  placeholder,
  autoComplete = "off",
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [value]);

  const enabled = open && debounced.length >= MIN_QUERY_LENGTH;
  const query = useQuery({
    queryKey: sharedKeys.banks.search(debounced),
    queryFn: () => searchBanks(debounced),
    enabled,
  });

  const results = enabled && query.isSuccess ? query.data : [];

  useEffect(() => {
    setActiveIndex(0);
  }, [results.length, debounced]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function selectBank(bankName: string) {
    onChange(bankName);
    setOpen(false);
  }

  const trimmedLength = value.trim().length;
  const status = !open
    ? null
    : trimmedLength === 0
      ? "Type a bank name to search."
      : trimmedLength < MIN_QUERY_LENGTH
        ? "Type at least 2 characters to search."
        : query.isFetching
          ? "Searching…"
          : query.isError
            ? "Couldn't search banks. You can still type the bank name."
            : results.length === 0
              ? "No matching banks"
              : null;

  const showPanel = open && (status !== null || results.length > 0);
  const listboxId = `${id}-listbox`;
  const activeOptionId = results[activeIndex] ? `${id}-option-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        invalid={invalid}
        autoComplete={autoComplete}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open ? activeOptionId : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              return;
            }
            setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (results.length > 0) {
              setActiveIndex((index) => (index - 1 + results.length) % results.length);
            }
          } else if (event.key === "Enter") {
            if (open && results[activeIndex]) {
              event.preventDefault();
              selectBank(results[activeIndex].bankName);
            }
          } else if (event.key === "Escape") {
            if (open) {
              event.preventDefault();
              setOpen(false);
            }
          }
        }}
      />
      {showPanel ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Bank name suggestions"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-steel/20 bg-paper-elev py-1 shadow-[var(--elevation-2)]"
        >
          {status ? (
            <li className="type-helper px-3 py-2 text-steel" role="status">
              {status}
            </li>
          ) : (
            results.map((bank, index) => (
              <li key={bank.id} role="presentation">
                <button
                  type="button"
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex min-h-10 w-full items-center px-3 py-2 text-left font-display text-[length:var(--text-body-size)] text-ink",
                    index === activeIndex && "bg-steel/[0.08]"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectBank(bank.bankName)}
                >
                  {bank.bankName}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
