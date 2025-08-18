/*
 * Copyright (c) 2024-2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/common/Toast";
import { ClockIcon } from "@heroicons/react/24/outline";

interface TimezoneSettings {
  offset: number; // UTC offset in hours (-12 to +14)
  displayFormat: "12h" | "24h";
}

const TIMEZONE_OPTIONS = [
  { value: -12, label: "UTC-12:00 (Baker Island)" },
  { value: -11, label: "UTC-11:00 (American Samoa)" },
  { value: -10, label: "UTC-10:00 (Hawaii)" },
  { value: -9, label: "UTC-09:00 (Alaska)" },
  { value: -8, label: "UTC-08:00 (Pacific)" },
  { value: -7, label: "UTC-07:00 (Mountain)" },
  { value: -6, label: "UTC-06:00 (Central)" },
  { value: -5, label: "UTC-05:00 (Eastern)" },
  { value: -4, label: "UTC-04:00 (Atlantic)" },
  { value: -3, label: "UTC-03:00 (Argentina)" },
  { value: -2, label: "UTC-02:00 (South Georgia)" },
  { value: -1, label: "UTC-01:00 (Azores)" },
  { value: 0, label: "UTC±00:00 (Greenwich)" },
  { value: 1, label: "UTC+01:00 (Central European)" },
  { value: 2, label: "UTC+02:00 (Eastern European)" },
  { value: 3, label: "UTC+03:00 (Moscow)" },
  { value: 4, label: "UTC+04:00 (Gulf)" },
  { value: 5, label: "UTC+05:00 (Pakistan)" },
  { value: 5.5, label: "UTC+05:30 (India)" },
  { value: 6, label: "UTC+06:00 (Bangladesh)" },
  { value: 7, label: "UTC+07:00 (Indochina)" },
  { value: 8, label: "UTC+08:00 (China)" },
  { value: 9, label: "UTC+09:00 (Japan)" },
  { value: 9.5, label: "UTC+09:30 (Central Australia)" },
  { value: 10, label: "UTC+10:00 (Eastern Australia)" },
  { value: 11, label: "UTC+11:00 (Solomon Islands)" },
  { value: 12, label: "UTC+12:00 (New Zealand)" },
  { value: 13, label: "UTC+13:00 (Tonga)" },
  { value: 14, label: "UTC+14:00 (Line Islands)" },
];

const getDefaultTimezone = (): number => {
  // Try to detect the user's timezone offset
  const offset = -(new Date().getTimezoneOffset() / 60);
  return offset;
};

export const TimezoneSettings: React.FC = () => {
  const [settings, setSettings] = useState<TimezoneSettings>(() => {
    const saved = localStorage.getItem("netronome-timezone-settings");
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      offset: getDefaultTimezone(),
      displayFormat: "24h" as const,
    };
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleOffsetChange = (value: string) => {
    setSettings(prev => ({
      ...prev,
      offset: parseFloat(value),
    }));
  };

  const handleFormatChange = (value: string) => {
    setSettings(prev => ({
      ...prev,
      displayFormat: value as "12h" | "24h",
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save to localStorage
      localStorage.setItem("netronome-timezone-settings", JSON.stringify(settings));
      
      // Dispatch a custom event to notify other components about the timezone change
      window.dispatchEvent(new CustomEvent("timezoneSettingsChanged", {
        detail: settings
      }));
      
      showToast("Timezone settings saved successfully", "success");
    } catch (error) {
      console.error("Failed to save timezone settings:", error);
      showToast("Failed to save timezone settings", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const formatPreviewTime = () => {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const adjustedTime = new Date(utcTime + (settings.offset * 3600000));
    
    if (settings.displayFormat === "12h") {
      return adjustedTime.toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
        hour12: true,
      });
    } else {
      return adjustedTime.toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
        hour12: false,
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClockIcon className="w-5 h-5" />
            Timezone Settings
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure how timestamps are displayed throughout the application
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="timezone-offset">Timezone Offset</Label>
            <Select
              value={settings.offset.toString()}
              onValueChange={handleOffsetChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select timezone offset" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {TIMEZONE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value.toString()}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="time-format">Time Format</Label>
            <Select
              value={settings.displayFormat}
              onValueChange={handleFormatChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24-hour format</SelectItem>
                <SelectItem value="12h">12-hour format (AM/PM)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
            <h4 className="font-medium text-sm text-gray-900 dark:text-white mb-2">
              Preview
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current time with your settings: <span className="font-mono font-medium">
                {formatPreviewTime()}
              </span>
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              isLoading={isSaving}
            >
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
