"use client";

import type { SearchResult } from "@/lib/types";

const ATTRIBUTE_LABELS: Record<string, string> = {
  fastener_type: "Type",
  thread_size:   "Thread",
  length:        "Length",
  material:      "Material",
  grade:         "Grade",
  finish:        "Finish",
  standard:      "Standard",
};

interface ResultCardProps {
  result: SearchResult;
  rank:   1 | 2 | 3;
}

const RANK_STYLES: Record<number, { border: string; badge: string; ring: string }> = {
  1: {
    border: "border-blue-200 bg-white shadow-md",
    badge:  "bg-blue-600 text-white",
    ring:   "ring-1 ring-blue-200",
  },
  2: {
    border: "border-slate-200 bg-white shadow-sm",
    badge:  "bg-slate-500 text-white",
    ring:   "",
  },
  3: {
    border: "border-slate-200 bg-white shadow-sm",
    badge:  "bg-slate-400 text-white",
    ring:   "",
  },
};

function ScoreBar({ value, label, color = "bg-blue-400" }: { value: number; label: string; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const { label, classes } = pct >= 65
    ? { label: "High confidence",   classes: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : pct >= 40
    ? { label: "Medium confidence", classes: "bg-amber-50  text-amber-700  border-amber-200"  }
    : { label: "Low confidence",    classes: "bg-red-50    text-red-700    border-red-200"    };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${classes}`}>
      <span className="font-bold">{pct}%</span>
      <span className="opacity-75">{label}</span>
    </span>
  );
}

export default function ResultCard({ result, rank }: ResultCardProps) {
  const style    = RANK_STYLES[rank];
  const pct      = Math.round(result.final_score * 100);
  const attrList = Object.entries(result.attributes).filter(([, v]) => v !== null);

  return (
    <div className={`rounded-xl border p-5 ${style.border} ${style.ring} transition-all`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${style.badge}`}>
            {rank}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-snug">
              {result.description}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-slate-500">{result.catalog_id}</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-mono text-slate-400">{result.sku}</span>
              {!result.active && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Inactive
                  </span>
                </>
              )}
            </div>
            {result.history_boosted && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Increased score based on customer history
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Match score badge */}
        <div className="shrink-0 text-right">
          <div className={`text-xl font-bold ${rank === 1 ? "text-blue-600" : "text-slate-500"}`}>
            {pct}%
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wide">match score</div>
        </div>
      </div>

      {/* Attribute chips */}
      {attrList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {attrList.map(([key, val]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 border border-slate-200"
            >
              <span className="text-slate-400 font-medium">{ATTRIBUTE_LABELS[key]}:</span>
              <span>{val}</span>
            </span>
          ))}
        </div>
      )}

      {/* Confidence + score breakdown */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Confidence</span>
          <ConfidencePill value={result.confidence} />
        </div>
        <div className="space-y-1.5">
          <ScoreBar value={result.attr_score}      label="Attribute match" color="bg-blue-400"   />
          <ScoreBar value={result.embedding_score} label="Semantic match"  color="bg-violet-400" />
        </div>
      </div>
    </div>
  );
}
