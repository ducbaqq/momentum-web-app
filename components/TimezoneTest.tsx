/**
 * Test component to verify timezone conversion accuracy
 * This component can be temporarily added to any page to test the dateUtils functions
 */

'use client';

import { useState, useEffect } from 'react';
import {
  utcToLocal,
  localToUtc, 
  formatLocalDateTime,
  formatCompactLocalDateTime,
  getCurrentLocalDateTime,
  getLocalDateTimeAgo,
  getUserTimezone,
  getTimezoneOffset
} from '@/lib/dateUtils';

export default function TimezoneTest() {
  const [testResults, setTestResults] = useState<string[]>([]);

  useEffect(() => {
    const runTests = () => {
      const results: string[] = [];
      
      // Test 1: Current time conversion
      const now = new Date();
      const nowUtc = now.toISOString();
      const nowLocal = utcToLocal(nowUtc);
      const nowBackToUtc = localToUtc(nowLocal);
      
      results.push('=== Current Time Test ===');
      results.push(`Original UTC: ${nowUtc}`);
      results.push(`To Local: ${nowLocal}`);
      results.push(`Back to UTC: ${nowBackToUtc}`);
      results.push(`Round-trip match: ${nowUtc === nowBackToUtc ? '✅' : '❌'}`);
      results.push('');

      // Test 2: Specific date conversion  
      const testDate = '2024-01-15T12:00:00.000Z';
      const testLocal = utcToLocal(testDate);
      const testBackToUtc = localToUtc(testLocal);
      
      results.push('=== Specific Date Test ===');
      results.push(`UTC: ${testDate}`);
      results.push(`To Local: ${testLocal}`);
      results.push(`Back to UTC: ${testBackToUtc}`);
      results.push(`Round-trip match: ${testDate === testBackToUtc ? '✅' : '❌'}`);
      results.push('');

      // Test 3: Formatting tests
      results.push('=== Formatting Tests ===');
      results.push(`Current timezone: ${getUserTimezone()}`);
      results.push(`Timezone offset: ${getTimezoneOffset()}`);
      results.push(`Formatted local: ${formatLocalDateTime(testDate)}`);
      results.push(`Compact local: ${formatCompactLocalDateTime(testDate)}`);
      results.push(`Current local: ${getCurrentLocalDateTime()}`);
      results.push(`30 days ago: ${getLocalDateTimeAgo(30)}`);
      results.push('');

      // Test 4: Edge cases
      results.push('=== Edge Cases ===');
      results.push(`Empty string: "${utcToLocal('')}" -> "${localToUtc('')}"`);
      results.push(`Invalid date: "${utcToLocal('invalid')}" -> "${localToUtc('invalid')}"`);
      
      setTestResults(results);
    };

    runTests();
  }, []);

  return (
    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 my-4">
      <h3 className="text-lg font-semibold mb-4 text-yellow-400">🧪 Timezone Conversion Tests</h3>
      <div className="text-xs font-mono space-y-1 text-yellow-100">
        {testResults.map((result, index) => (
          <div key={index} className={result === '' ? 'h-2' : ''}>
            {result}
          </div>
        ))}
      </div>
      <p className="text-xs text-yellow-300 mt-4">
        ⚠️ This is a test component - remove from production
      </p>
    </div>
  );
}