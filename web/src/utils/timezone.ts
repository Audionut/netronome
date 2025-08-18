/*
 * Copyright (c) 2024-2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

interface TimezoneSettings {
  offset: number; // UTC offset in hours (-12 to +14)
  displayFormat: "12h" | "24h";
}

const DEFAULT_SETTINGS: TimezoneSettings = {
  offset: -(new Date().getTimezoneOffset() / 60), // Auto-detect user timezone
  displayFormat: "24h",
};

export const getTimezoneSettings = (): TimezoneSettings => {
  try {
    const saved = localStorage.getItem("netronome-timezone-settings");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error("Failed to load timezone settings:", error);
  }
  return DEFAULT_SETTINGS;
};

export const adjustDateForTimezone = (date: Date | string, settings?: TimezoneSettings): Date => {
  const actualSettings = settings || getTimezoneSettings();
  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  // Convert to UTC then apply timezone offset
  const utcTime = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
  return new Date(utcTime + (actualSettings.offset * 3600000));
};

export const formatDateWithTimezone = (
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {},
  settings?: TimezoneSettings
): string => {
  const actualSettings = settings || getTimezoneSettings();
  const adjustedDate = adjustDateForTimezone(date, actualSettings);
  
  const formatOptions: Intl.DateTimeFormatOptions = {
    ...options,
    hour12: actualSettings.displayFormat === "12h",
  };
  
  return adjustedDate.toLocaleString(undefined, formatOptions);
};

// Convenience functions for common date formats
export const formatTimestamp = (date: Date | string, settings?: TimezoneSettings): string => {
  return formatDateWithTimezone(date, {
    dateStyle: "short",
    timeStyle: "short",
  }, settings);
};

export const formatChartTimestamp = (
  date: Date | string,
  timeRange: string,
  isMobile: boolean = false,
  settings?: TimezoneSettings
): string => {
  const adjustedDate = adjustDateForTimezone(date, settings);
  const actualSettings = settings || getTimezoneSettings();
  
  switch (timeRange) {
    case "1d":
      // 24 hours: show time, with day name on desktop
      if (isMobile) {
        return adjustedDate.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          hour12: actualSettings.displayFormat === "12h",
        });
      }
      return adjustedDate.toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: actualSettings.displayFormat === "12h",
      });

    case "3d":
      // 3 days: show day and time
      if (isMobile) {
        return adjustedDate.toLocaleString(undefined, {
          weekday: "short",
          hour: "numeric",
          hour12: actualSettings.displayFormat === "12h",
        });
      }
      return adjustedDate.toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: actualSettings.displayFormat === "12h",
      });

    case "1w":
      // 1 week: show date with optional time on desktop
      if (isMobile) {
        return adjustedDate.toLocaleString(undefined, {
          month: "numeric",
          day: "numeric",
        });
      }
      return adjustedDate.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

    case "1m":
      // 1 month: show date
      if (isMobile) {
        return adjustedDate.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
        });
      }
      return adjustedDate.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
      });

    case "all": {
      // All time: show date with year if needed
      const now = new Date();
      const showYear = adjustedDate.getFullYear() !== now.getFullYear();

      if (isMobile) {
        return adjustedDate.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: showYear ? "2-digit" : undefined,
        });
      }
      return adjustedDate.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: showYear ? "numeric" : undefined,
      });
    }

    default:
      // Fallback to time-based format
      return adjustedDate.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: actualSettings.displayFormat === "12h",
      });
  }
};
