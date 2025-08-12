'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function SimpleTestPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runId) {
      fetch(`/api/backtest/runs/${runId}`)
        .then(res => res.json())
        .then(data => setData(data))
        .catch(err => setError(err.message));
    }
  }, [runId]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Simple Test Page</h1>
      <p>Run ID: {runId}</p>
      
      {error && (
        <div className="text-red-400 mt-4">
          Error: {error}
        </div>
      )}
      
      {data && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">API Response:</h2>
          <pre className="bg-gray-800 p-4 rounded text-sm overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}