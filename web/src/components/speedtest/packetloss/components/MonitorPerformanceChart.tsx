/*
 * Copyright (c) 2024-2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import React, { useMemo } from "react";
import { formatters } from "@/utils/timeSettings";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PacketLossResult } from "@/types/types";

// Define filter range type for performance charts
export type PerformanceTimeRange = "10" | "30" | "50" | "100" | "all";

interface MonitorPerformanceChartProps {
  historyList: PacketLossResult[];
  selectedMonitorId: number;
  timeRange?: PerformanceTimeRange;
  onTimeRangeChange?: (range: PerformanceTimeRange) => void;
}

export const MonitorPerformanceChart: React.FC<
  MonitorPerformanceChartProps
> = ({ historyList, selectedMonitorId, timeRange = "30", onTimeRangeChange }) => {
  // Time range options with result counts
  const timeRangeOptions: { value: PerformanceTimeRange; label: string }[] = [
    { value: "10", label: "Last 10 results" },
    { value: "30", label: "Last 30 results" },
    { value: "50", label: "Last 50 results" },
    { value: "100", label: "Last 100 results" },
    { value: "all", label: "All results" },
  ];

  // Get the number of results to display based on timeRange
  const getResultCount = (range: PerformanceTimeRange): number => {
    switch (range) {
      case "10": return 10;
      case "30": return 30;
      case "50": return 50;
      case "100": return 100;
      case "all": return historyList.length;
      default: return 30;
    }
  };

  const resultCount = getResultCount(timeRange);

  // Prepare chart data - use useMemo to ensure it updates when historyList or timeRange changes
  const chartData = useMemo(() => {
    // historyList is in descending order (newest first), so take the specified count and reverse
    const data = historyList
      .slice(0, resultCount) // Take specified number of results (most recent)
      .reverse() // Reverse to show oldest to newest for chart
      .map((result) => {
        const date = new Date(result.createdAt);

        // Use consistent formatting for all data points
        const timeLabel = formatters.dateTime(date);

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

  // Calculate RTT statistics for better axis scaling
  const rttStats = useMemo(() => {
    if (chartData.length === 0) return null;
    
    const allRttValues = chartData.flatMap(d => [d.avgRtt, d.minRtt, d.maxRtt]).filter(v => v > 0);
    if (allRttValues.length === 0) return null;
    
    const min = Math.min(...allRttValues);
    const max = Math.max(...allRttValues);
    const avg = allRttValues.reduce((sum, val) => sum + val, 0) / allRttValues.length;
    
    // Calculate a good range around the data
    const range = max - min;
    const padding = Math.max(range * 0.1, 5); // 10% padding or 5ms minimum
    
    return {
      min: Math.max(0, min - padding),
      max: max + padding,
      avg
    };
  }, [chartData]);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-gray-700 dark:text-gray-300 font-medium">
            Performance Trends
          </h3>
          {onTimeRangeChange && (
            <Select value={timeRange} onValueChange={onTimeRangeChange}>
              <SelectTrigger className="w-[180px] px-3 py-2 bg-gray-200/50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-900 rounded-lg text-gray-700 dark:text-gray-300">
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
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-gray-600 dark:text-gray-400 text-xs">
            {timeRange === "all" ? "All tests" : `Last ${resultCount} tests`} • {chartData.length} data points
            {rttStats && (
              <span className="ml-2 text-blue-600 dark:text-blue-400">
                • Avg RTT: {rttStats.avg.toFixed(1)}ms
              </span>
            )}
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-red-500"></div>
              <span>Packet Loss</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-blue-500"></div>
              <span>Avg RTT</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-emerald-500 border-dashed"></div>
              <span>Min RTT</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-yellow-500 border-dashed"></div>
              <span>Max RTT</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-80 bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200/50 dark:border-gray-700/50">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            key={`chart-${selectedMonitorId}-${historyList[0]?.id || 0}`}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(128, 128, 128, 0.15)"
              strokeWidth={0.5}
            />
            <XAxis
              dataKey="time"
              stroke="rgb(156, 163, 175)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="rgb(156, 163, 175)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              scale="linear"
              domain={rttStats ? [Math.floor(rttStats.min), Math.ceil(rttStats.max)] : ['dataMin', 'dataMax']}
              allowDataOverflow={false}
              label={{
                value: "RTT (ms)",
                angle: -90,
                position: "insideLeft",
                style: {
                  fill: "rgb(156, 163, 175)",
                  textAnchor: "middle",
                },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="rgb(239, 68, 68)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              scale="linear"
              domain={[0, 100]}
              label={{
                value: "Packet Loss (%)",
                angle: 90,
                position: "insideRight",
                style: {
                  fill: "rgb(239, 68, 68)",
                  textAnchor: "middle",
                },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(17, 24, 39, 0.95)",
                border: "1px solid rgba(75, 85, 99, 0.3)",
                borderRadius: "0.5rem",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
              }}
              labelStyle={{
                color: "rgb(229, 231, 235)",
                fontSize: "12px",
                fontWeight: "medium",
              }}
              formatter={(value: number | string) => {
                if (typeof value === "number") {
                  return value.toFixed(1);
                }
                return value;
              }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="packetLoss"
              stroke="rgb(239, 68, 68)"
              strokeWidth={2.5}
              name="Packet Loss %"
              dot={{
                fill: "rgb(239, 68, 68)",
                strokeWidth: 0,
                r: 3,
              }}
              activeDot={{
                r: 5,
                stroke: "rgb(239, 68, 68)",
                strokeWidth: 2,
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgRtt"
              stroke="rgb(59, 130, 246)"
              strokeWidth={2.5}
              name="Avg RTT"
              dot={{
                fill: "rgb(59, 130, 246)",
                strokeWidth: 0,
                r: 3,
              }}
              activeDot={{
                r: 5,
                stroke: "rgb(59, 130, 246)",
                strokeWidth: 2,
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="minRtt"
              stroke="rgb(16, 185, 129)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              name="Min RTT"
              dot={false}
              activeDot={{
                r: 4,
                stroke: "rgb(16, 185, 129)",
                strokeWidth: 2,
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="maxRtt"
              stroke="rgb(251, 191, 36)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              name="Max RTT"
              dot={false}
              activeDot={{
                r: 4,
                stroke: "rgb(251, 191, 36)",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
