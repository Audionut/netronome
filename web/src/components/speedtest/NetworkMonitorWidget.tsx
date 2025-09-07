/*
 * Copyright (c) 2024-2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPacketLossMonitors, getPacketLossHistory } from "@/api/packetloss";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatters } from "@/utils/timeSettings";

// Define time range type for network monitor charts
export type NetworkMonitorTimeRange = "10" | "30" | "50" | "100" | "500" | "1000" | "all";

interface DragHandleProps {
  // Remove drag handle props for now to simplify
}

interface NetworkMonitorWidgetProps extends DragHandleProps {
  // No additional props needed
}

export const NetworkMonitorWidget: React.FC<NetworkMonitorWidgetProps> = () => {
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState<NetworkMonitorTimeRange>("100");

  // Fetch all monitors
  const { data: monitors, isLoading: monitorsLoading } = useQuery({
    queryKey: ["packetloss", "monitors"],
    queryFn: getPacketLossMonitors,
    staleTime: 30000,
  });

  const monitorList = monitors || [];

  // Auto-select the first active monitor if none is selected
  useEffect(() => {
    if (monitorList.length > 0 && !selectedMonitorId) {
      const activeMonitor = monitorList.find(m => m.enabled) || monitorList[0];
      setSelectedMonitorId(activeMonitor.id);
    }
  }, [monitorList, selectedMonitorId]);

  // Get the limit based on the time range
  const getHistoryLimit = (range: NetworkMonitorTimeRange): number => {
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
  };

  const historyLimit = getHistoryLimit(timeRange);

  // Fetch history for selected monitor
  const { data: monitorHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["packetloss", "history", selectedMonitorId, historyLimit],
    queryFn: () => selectedMonitorId ? getPacketLossHistory(selectedMonitorId, historyLimit) : Promise.resolve([]),
    enabled: !!selectedMonitorId,
    staleTime: 5000,
    refetchInterval: false,
  });

  const historyList = monitorHistory || [];

  // Time range options
  const timeRangeOptions: { value: NetworkMonitorTimeRange; label: string }[] = [
    { value: "10", label: "Last 10" },
    { value: "30", label: "Last 30" },
    { value: "50", label: "Last 50" },
    { value: "100", label: "Last 100" },
    { value: "500", label: "Last 500" },
    { value: "1000", label: "Last 1000" },
    { value: "all", label: "All" },
  ];

  // Get the number of results to display based on timeRange
  const getResultCount = (range: NetworkMonitorTimeRange): number => {
    switch (range) {
      case "10": return 10;
      case "30": return 30;
      case "50": return 50;
      case "100": return 100;
      case "500": return 500;
      case "1000": return 1000;
      case "all": return historyList.length;
      default: return 100;
    }
  };

  const resultCount = getResultCount(timeRange);

  // Prepare chart data
  const chartData = React.useMemo(() => {
    const data = historyList
      .slice(0, resultCount)
      .reverse() // Reverse to show oldest to newest for chart
      .map((result) => {
        const date = new Date(result.createdAt);
        const timeLabel = formatters.time(date);

        return {
          time: timeLabel,
          packetLoss: result.packetLoss,
          avgRtt: result.avgRtt,
          minRtt: result.minRtt,
          maxRtt: result.maxRtt,
        };
      });

    return data;
  }, [historyList, resultCount]);

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <p className="text-gray-900 dark:text-gray-100 font-medium">{`Time: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className={`text-${entry.color} text-sm`}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
              {entry.dataKey === 'packetLoss' ? '%' : 'ms'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const selectedMonitor = monitorList.find(m => m.id === selectedMonitorId);

  if (monitorsLoading) {
    return (
      <div className="bg-gray-50/95 dark:bg-gray-850/95 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-800">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (monitorList.length === 0) {
    return (
      <div className="bg-gray-50/95 dark:bg-gray-850/95 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-800">
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400 mb-2">No Network Monitors</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Create network monitors in the Traceroute tab to see performance charts here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50/95 dark:bg-gray-850/95 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Network Monitor
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Monitor Selection */}
          <Select
            value={selectedMonitorId?.toString() || ""}
            onValueChange={(value) => setSelectedMonitorId(parseInt(value))}
          >
            <SelectTrigger className="w-[200px] px-3 py-2 bg-gray-200/50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-900 rounded-lg text-gray-700 dark:text-gray-300">
              <SelectValue placeholder="Select monitor" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              {monitorList.map((monitor) => (
                <SelectItem
                  key={monitor.id}
                  value={monitor.id.toString()}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        monitor.enabled ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                    />
                    <span>{monitor.name || monitor.host}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Time Range Selection */}
          <Select value={timeRange} onValueChange={(value: NetworkMonitorTimeRange) => setTimeRange(value)}>
            <SelectTrigger className="w-[120px] px-3 py-2 bg-gray-200/50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-900 rounded-lg text-gray-700 dark:text-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              {timeRangeOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedMonitor && (
        <div className="mb-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Monitoring: <span className="font-medium text-gray-900 dark:text-gray-100">{selectedMonitor.host}</span>
            {selectedMonitor.name && selectedMonitor.name !== selectedMonitor.host && (
              <span> ({selectedMonitor.name})</span>
            )}
            <span className="ml-2">•</span>
            <span className="ml-2">{chartData.length} data points</span>
            {selectedMonitor.threshold && (
              <>
                <span className="ml-2">•</span>
                <span className="ml-2">Threshold: {selectedMonitor.threshold}% loss</span>
              </>
            )}
          </p>
        </div>
      )}

      {historyLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">No data available for the selected monitor</p>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid 
                strokeDasharray="3 3" 
                className="stroke-gray-300 dark:stroke-gray-700" 
              />
              <XAxis 
                dataKey="time" 
                className="text-gray-600 dark:text-gray-400 text-xs"
                tick={{ fontSize: 11 }}
              />
              <YAxis 
                yAxisId="rtt"
                className="text-gray-600 dark:text-gray-400 text-xs"
                tick={{ fontSize: 11 }}
                label={{ value: 'RTT (ms)', angle: -90, position: 'insideLeft' }}
              />
              <YAxis 
                yAxisId="loss"
                orientation="right"
                className="text-gray-600 dark:text-gray-400 text-xs"
                tick={{ fontSize: 11 }}
                label={{ value: 'Packet Loss (%)', angle: 90, position: 'insideRight' }}
                domain={[0, 100]}
                allowDataOverflow={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                yAxisId="rtt"
                type="monotone"
                dataKey="avgRtt"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
                name="Avg RTT"
                connectNulls={false}
              />
              <Line
                yAxisId="rtt"
                type="monotone"
                dataKey="minRtt"
                stroke="#10B981"
                strokeWidth={1}
                dot={false}
                name="Min RTT"
                strokeDasharray="5 5"
                connectNulls={false}
              />
              <Line
                yAxisId="rtt"
                type="monotone"
                dataKey="maxRtt"
                stroke="#F59E0B"
                strokeWidth={1}
                dot={false}
                name="Max RTT"
                strokeDasharray="5 5"
                connectNulls={false}
              />
              <Line
                yAxisId="loss"
                type="monotone"
                dataKey="packetLoss"
                stroke="#EF4444"
                strokeWidth={2}
                dot={false}
                name="Packet Loss"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-blue-500"></div>
            <span>Avg RTT</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-green-500 border-dashed border-t"></div>
            <span>Min RTT</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-yellow-500 border-dashed border-t"></div>
            <span>Max RTT</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-red-500"></div>
            <span>Packet Loss</span>
          </div>
        </div>
        <div>
          {timeRange === "all" ? "All tests" : `Last ${resultCount} tests`}
        </div>
      </div>
    </div>
  );
};
