function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg bg-secondary animate-pulse ${className}`} />;
}

export default function CasesLoading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-6 lg:px-10 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="w-24 h-3.5" />
            <Skeleton className="w-16 h-2.5" />
          </div>
        </div>
        <Skeleton className="w-20 h-7 rounded-lg" />
      </header>
      <main className="px-6 lg:px-10 py-6 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-border p-4 text-center space-y-2">
              <Skeleton className="w-16 h-7 mx-auto" />
              <Skeleton className="w-20 h-3 mx-auto" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 min-w-56" />
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="h-11 bg-secondary/50 border-b border-border" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-4 py-3.5 border-b border-border last:border-0">
              <Skeleton className="w-28 h-4" />
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-16 h-5 rounded-full" />
              <Skeleton className="w-24 h-4" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
