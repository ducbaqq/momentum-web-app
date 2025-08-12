/**
 * Date/Time utility functions for handling timezone conversions
 * between user's local time (for display) and UTC (for API communication)
 */

/**
 * Convert a UTC ISO string to local datetime-local input format
 * @param utcIsoString - UTC ISO string (e.g., "2024-01-01T12:00:00.000Z")
 * @returns Local datetime string in format "YYYY-MM-DDTHH:MM" for datetime-local input
 */
export function utcToLocal(utcIsoString: string): string {
  if (!utcIsoString) return '';
  
  const date = new Date(utcIsoString);
  
  // Check if date is valid
  if (isNaN(date.getTime())) return '';
  
  // Format for datetime-local input (YYYY-MM-DDTHH:MM)
  // Use local timezone offset
  const offset = date.getTimezoneOffset() * 60000; // offset in milliseconds
  const localDate = new Date(date.getTime() - offset);
  
  return localDate.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

/**
 * Convert local datetime-local input value to UTC ISO string
 * @param localDatetimeString - Local datetime string from datetime-local input (e.g., "2024-01-01T12:00")
 * @returns UTC ISO string for API communication
 */
export function localToUtc(localDatetimeString: string): string {
  if (!localDatetimeString) return '';
  
  // datetime-local gives us a string like "2024-01-01T12:00"
  // We need to treat this as local time and convert to UTC
  const localDate = new Date(localDatetimeString);
  
  // Check if date is valid
  if (isNaN(localDate.getTime())) return '';
  
  return localDate.toISOString();
}

/**
 * Format a UTC ISO string for display in user's local timezone
 * @param utcIsoString - UTC ISO string
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted local date string
 */
export function formatLocalDateTime(
  utcIsoString: string, 
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }
): string {
  if (!utcIsoString) return '';
  
  const date = new Date(utcIsoString);
  
  if (isNaN(date.getTime())) return '';
  
  return date.toLocaleString(undefined, options);
}

/**
 * Format a UTC ISO string for compact display (no timezone name)
 * @param utcIsoString - UTC ISO string  
 * @returns Formatted local date string (compact)
 */
export function formatCompactLocalDateTime(utcIsoString: string): string {
  return formatLocalDateTime(utcIsoString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric', 
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get the current date/time in local datetime-local format
 * @returns Current local datetime string for datetime-local input
 */
export function getCurrentLocalDateTime(): string {
  return utcToLocal(new Date().toISOString());
}

/**
 * Get a date N days ago in local datetime-local format
 * @param daysAgo - Number of days in the past
 * @returns Local datetime string for datetime-local input
 */
export function getLocalDateTimeAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return utcToLocal(date.toISOString());
}

/**
 * Get user's timezone name for display
 * @returns Timezone name (e.g., "America/New_York", "UTC")
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get user's timezone offset string (e.g., "UTC-5", "UTC+1")  
 * @returns Timezone offset string
 */
export function getTimezoneOffset(): string {
  const offset = new Date().getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset <= 0 ? '+' : '-';
  
  return `UTC${sign}${hours.toString().padStart(2, '0')}${minutes > 0 ? ':' + minutes.toString().padStart(2, '0') : ''}`;
}