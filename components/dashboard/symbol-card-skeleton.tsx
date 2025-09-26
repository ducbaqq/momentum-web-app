export function SymbolCardSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-card-border bg-card-hover animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="skeleton h-5 w-16"></div>
          <div className="skeleton h-4 w-4 rounded"></div>
        </div>
        <div className="skeleton h-6 w-12 rounded-full"></div>
      </div>

      {/* Price */}
      <div className="skeleton h-8 w-20 mb-3"></div>

      {/* Metrics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-12"></div>
          <div className="skeleton h-4 w-16"></div>
        </div>
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-12"></div>
          <div className="skeleton h-4 w-16"></div>
        </div>
      </div>
    </div>
  );
}

export function MarketOverviewSkeleton() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div className="skeleton h-7 w-40"></div>
        <div className="skeleton h-9 w-32 rounded-lg"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(12)].map((_, i) => (
          <SymbolCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
