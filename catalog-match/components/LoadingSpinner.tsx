"use client";

export default function LoadingSpinner({ label = "Searching catalog..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
        <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
