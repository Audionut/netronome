/*
 * Copyright (c) 2024-2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { PacketLossMonitor } from "@/types/types";
import { getPacketLossHistory } from "@/api/packetloss";
import { MonitorStatusCard } from "./components/MonitorStatusCard";
import { MonitorPerformanceChart, PerformanceTimeRange } from "./components/MonitorPerformanceChart";
import { MonitorResultsTable } from "./components/MonitorResultsTable";
import { MonitorStatus } from "./types/monitorStatus";

interface PacketLossMonitorDetailsProps {
  selectedMonitor: PacketLossMonitor;
  monitorStatuses: Map<number, MonitorStatus>;
  onTraceRoute?: () => void;
}

export const PacketLossMonitorDetails: React.FC<
  PacketLossMonitorDetailsProps
> = ({ selectedMonitor, monitorStatuses, onTraceRoute }) => {
  const queryClient = useQueryClient();

  // Performance chart time range state with localStorage persistence
  const [performanceTimeRange, setPerformanceTimeRange] = useState<PerformanceTimeRange>(() => {
    const saved = localStorage.getItem(`monitor-${selectedMonitor.id}-time-range`);
    return (saved as PerformanceTimeRange) || "30";
  });

  // Persist time range selection to localStorage
  useEffect(() => {
    localStorage.setItem(`monitor-${selectedMonitor.id}-time-range`, performanceTimeRange);
  }, [performanceTimeRange, selectedMonitor.id]);

  // Handle time range changes
  const handleTimeRangeChange = (range: PerformanceTimeRange) => {
    setPerformanceTimeRange(range);
  };

  // Get the limit based on the time range
  const getHistoryLimit = (range: PerformanceTimeRange): number => {
    const limit = (() => {
      switch (range) {
        case "10": return 10;
        case "30": return 30;
        case "50": return 50;
        case "100": return 100;
        case "500": return 500;
        case "1000": return 1000;
        case "all": return 0; // 0 means no limit (backend will cap at 2000)
        default: return 100;
      }
    })();
    console.log(`getHistoryLimit: range=${range}, limit=${limit}`);
    return limit;
  };

  const historyLimit = getHistoryLimit(performanceTimeRange);

  // Fetch history for selected monitor
  const { data: monitorHistory, refetch } = useQuery({
    queryKey: ["packetloss", "history", selectedMonitor.id, historyLimit],
    queryFn: () => {
      console.log(`Fetching history for monitor ${selectedMonitor.id} with limit ${historyLimit}`);
      return getPacketLossHistory(selectedMonitor.id, historyLimit);
    },
    staleTime: 5000, // Consider data stale after 5 seconds
    refetchInterval: false, // Don't refetch automatically
  });

  // Ensure monitorHistory is always an array
  const historyList = monitorHistory || [];
  console.log(`historyList length: ${historyList.length}, performanceTimeRange: ${performanceTimeRange}`);

  // Fetch fresh history when monitor is selected or time range changes
  useEffect(() => {
    // Invalidate and refetch the query when time range changes
    queryClient.invalidateQueries({
      queryKey: ["packetloss", "history", selectedMonitor.id],
    });
    
    // Force a refetch with the new limit
    refetch();
  }, [selectedMonitor, historyLimit, queryClient, refetch]);

  const status = monitorStatuses.get(selectedMonitor.id);
  const showStatus =
    selectedMonitor.enabled &&
    status &&
    (status.isRunning || status.packetLoss !== undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="flex-1"
    >
      <div className="bg-gray-50/95 dark:bg-gray-850/95 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {selectedMonitor.name || selectedMonitor.host} Details
          </h2>
          {onTraceRoute && (
            <motion.button
              onClick={onTraceRoute}
              className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
              title="Run traceroute to this host"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <GlobeAltIcon className="w-3 h-3" />
              <span>Trace Route</span>
            </motion.button>
          )}
        </div>

        {/* Current Status - Only show when actively testing or has recent results */}
        {showStatus && (
          <MonitorStatusCard
            status={status}
            threshold={selectedMonitor.threshold}
          />
        )}

        {/* Performance Chart */}
        <MonitorPerformanceChart
          historyList={historyList}
          selectedMonitorId={selectedMonitor.id}
          timeRange={performanceTimeRange}
          onTimeRangeChange={handleTimeRangeChange}
        />

        {/* Recent Results */}
        <MonitorResultsTable
          historyList={historyList}
          selectedMonitor={selectedMonitor}
        />
      </div>
    </motion.div>
  );
};
