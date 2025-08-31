function CardSkeleton() {
  return (
    <div className="card-modern p-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700 rounded-lg"></div>
          <div>
            <div className="h-5 bg-slate-700 rounded w-16 mb-2"></div>
            <div className="h-4 bg-slate-700 rounded w-24"></div>
          </div>
        </div>
        <div className="w-8 h-8 bg-slate-700 rounded"></div>
      </div>

      {/* Price skeleton */}
      <div className="mb-6">
        <div className="h-8 bg-slate-700 rounded w-32 mb-1"></div>
        <div className="h-4 bg-slate-700 rounded w-16"></div>
      </div>

      {/* Metrics skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div className="h-4 bg-slate-700 rounded w-16"></div>
            <div className="h-4 bg-slate-700 rounded w-12"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CardSkeleton;
