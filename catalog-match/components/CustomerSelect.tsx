"use client";

import { useEffect, useRef, useState } from "react";
import type { Customer } from "@/lib/types";

interface CustomerSelectProps {
  value: string;
  onChange: (customerId: string) => void;
}

export default function CustomerSelect({ value, onChange }: CustomerSelectProps) {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [search, setSearch]         = useState("");
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(true);
  const containerRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = customers.filter((c) =>
    c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_id.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCustomer = customers.find((c) => c.customer_id === value);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
      >
        <span className={selectedCustomer ? "text-slate-800" : "text-slate-400"}>
          {loading
            ? "Loading customers..."
            : selectedCustomer
            ? `${selectedCustomer.customer_name} (${selectedCustomer.customer_id})`
            : "Select customer (optional)"}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              placeholder="Type to filter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <ul className="max-h-52 overflow-y-auto">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                  className="w-full px-4 py-2.5 text-sm text-left text-slate-500 hover:bg-slate-50 italic"
                >
                  Clear selection
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400">No customers found</li>
            ) : (
              filtered.map((c) => (
                <li key={c.customer_id}>
                  <button
                    type="button"
                    onClick={() => { onChange(c.customer_id); setOpen(false); setSearch(""); }}
                    className={`w-full px-4 py-2.5 text-sm text-left hover:bg-blue-50 transition-colors ${
                      value === c.customer_id ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"
                    }`}
                  >
                    <span className="font-medium">{c.customer_name}</span>
                    <span className="ml-2 text-xs text-slate-400">{c.customer_id}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
