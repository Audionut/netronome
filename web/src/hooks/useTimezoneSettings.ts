/*
 * Copyright (c) 2024-2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { useState, useEffect } from "react";
import { getTimezoneSettings } from "../utils/timezone";

interface TimezoneSettings {
  offset: number;
  displayFormat: "12h" | "24h";
}

export const useTimezoneSettings = () => {
  const [settings, setSettings] = useState<TimezoneSettings>(getTimezoneSettings);

  useEffect(() => {
    const handleTimezoneChange = (event: CustomEvent<TimezoneSettings>) => {
      setSettings(event.detail);
    };

    window.addEventListener("timezoneSettingsChanged", handleTimezoneChange as EventListener);

    return () => {
      window.removeEventListener("timezoneSettingsChanged", handleTimezoneChange as EventListener);
    };
  }, []);

  return settings;
};
