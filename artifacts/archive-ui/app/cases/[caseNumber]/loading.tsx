function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-secondary animate-pulse ${className}`} />;
}

export default function CaseDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-6 lg:px-10 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <Skeleton className="w-9 h-9 rounded-xl" />
        </div>
        <Skeleton className="w-px h-6" />
        <Skeleton className="w-24 h-7 rounded-lg" />
        <div className="flex-1 flex items-center gap-2">
          <Skeleton className="w-40 h-5" />
        </div>
        <Skeleton className="w-32 h-8 rounded-lg" />
      </header>
      <main className="px-6 lg:px-10 py-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-border p-4 space-y-3">
              <Skeleton className="w-16 h-3" />
              <Skeleton className="w-28 h-6" />
              <Skeleton className="w-20 h-3.5" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="w-20 h-5 rounded-full" />)}
        </div>
        <div className="border-t border-border pt-5 space-y-4">
          <div className="flex gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="w-32 h-8 rounded-xl" />)}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <Skeleton className="flex-1 h-16 rounded-2xl" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
