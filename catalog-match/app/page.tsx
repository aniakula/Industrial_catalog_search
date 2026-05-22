"use client";

import { useState } from "react";
import CustomerSelect from "@/components/CustomerSelect";
import ResultCard from "@/components/ResultCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { PartAttributes, SearchResponse } from "@/lib/types";

const ATTRIBUTE_LABELS: Record<string, string> = {
  fastener_type: "Type",
  drive_type:    "Drive",
  thread_size:   "Thread",
  length:        "Length",
  material:      "Material",
  grade:         "Grade",
  finish:        "Finish",
  standard:      "Standard",
};

const EXAMPLE_QUERIES = [
  "M8 flat washer",
  "SHCS 7/16 x 2-1/2",
  "1/2 rod 6 foot",
  "lock washer 5/8",
  "M8 x 50mm BHCS alloy black oxide",
  "brass hex nut 1/2-13",
];

export default function Home() {
  const [query, setQuery]             = useState("");
  const [customerId, setCustomerId]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [response, setResponse]       = useState<SearchResponse | null>(null);
  const [error, setError]             = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: query.trim(), customer_id: customerId || undefined }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Search failed");
      }

      const data: SearchResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleExampleClick(q: string) {
    setQuery(q);
    setResponse(null);
    setError(null);
  }

  const detectedAttrs = response
    ? Object.entries(response.query_attributes).filter(([, v]) => v !== null)
    : [];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-800">Catalog Match</h1>
              <p className="text-xs text-slate-400">Industrial fastener search</p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-mono">1,000 parts indexed</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">

        {/* Search card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-slate-800 mb-1">Find a part</h2>
          <p className="text-sm text-slate-500 mb-5">
            Describe what you need in plain language — abbreviations, part numbers, and shorthand all work.
          </p>

          <form onSubmit={handleSearch} className="space-y-3">
            {/* Query input */}
            <div className="relative">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch(e as unknown as React.FormEvent);
                  }
                }}
                placeholder='e.g. "M8 flat washer" or "SHCS 7/16 x 2-1/2" or "hex nut 1/2-13 brass"'
                rows={2}
                className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors placeholder:text-slate-400"
              />
            </div>

            {/* Customer select + submit */}
            <div className="flex gap-3">
              <div className="flex-1">
                <CustomerSelect value={customerId} onChange={setCustomerId} />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-1"
              >
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </form>

          {/* Example queries */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Try an example</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleExampleClick(q)}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors border border-slate-200"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        {loading && <LoadingSpinner />}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <span className="font-medium">Error: </span>{error}
          </div>
        )}

        {response && !loading && (
          <div>
            {/* Parsed query attributes */}
            {detectedAttrs.length > 0 && (
              <div className="mb-4 px-4 py-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide mr-1">
                  Detected:
                </span>
                {detectedAttrs.map(([key, val]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-700 border border-blue-200"
                  >
                    <span className="text-blue-400 font-medium">{ATTRIBUTE_LABELS[key]}:</span>
                    <span>{val as string}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Result cards */}
            {response.results.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No matching parts found.
              </div>
            ) : (
              <div className="space-y-3">
                {response.results.map((result, i) => (
                  <ResultCard
                    key={result.catalog_id}
                    result={result}
                    rank={(i + 1) as 1 | 2 | 3}
                  />
                ))}
              </div>
            )}

            {/* Customer personalization notice */}
            {customerId && (
              <p className="mt-4 text-center text-xs text-slate-400">
                Results reflect order history for {customerId}
              </p>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-4">
        <p className="text-center text-xs text-slate-400">
          Scores combine structured attribute matching (60%) and semantic vector similarity (40%)
        </p>
      </footer>
    </div>
  );
}
