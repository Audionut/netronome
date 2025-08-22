/*
 * Copyright (c) 2024-2025, s0up and the autobrr contributors.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Activity, Zap, Download, Upload, Gauge } from "lucide-react";
import { Server, BufferbloatUpdate, BufferbloatResult } from "@/types/types";
import { getBufferbloatTestStatus } from "@/api/speedtest";

interface BufferbloatTestProps {
  isOpen: boolean;
  onClose: () => void;
  selectedServer: Server | null;
}

export const BufferbloatTest: React.FC<BufferbloatTestProps> = ({
  isOpen,
  onClose,
  selectedServer,
}) => {
  const [pingTarget, setPingTarget] = useState("8.8.8.8");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BufferbloatResult | null>(null);
  const [progress, setProgress] = useState({
    phase: "ping_baseline" as "ping_baseline" | "speed_test" | "analysis" | "complete",
    progress: 0,
    baselineRtt: 0,
    currentRtt: 0,
    bufferbloat: 0,
    message: "",
  });

  // Poll for bufferbloat test status when test is running
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (isLoading) {
      pollInterval = setInterval(async () => {
        try {
          const update: BufferbloatUpdate | null = await getBufferbloatTestStatus();
          
          if (update) {
            setProgress(prev => ({
              ...prev,
              phase: update.phase === "baseline" ? "ping_baseline" :
                     update.phase === "speedtest" ? "speed_test" :
                     update.phase === "completed" ? "complete" : "analysis",
              progress: update.progress,
              baselineRtt: update.baselineRtt || prev.baselineRtt,
              currentRtt: update.currentRtt || prev.currentRtt,
              bufferbloat: update.bufferbloat || prev.bufferbloat,
              message: update.error || "",
            }));

            if (update.error) {
              setError(update.error);
              setIsLoading(false);
            } else if (update.isComplete) {
              setIsLoading(false);
            }
          }
        } catch (error) {
          console.error("Error polling bufferbloat status:", error);
        }
      }, 1000); // Poll every second
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isLoading]);

  // Reset progress when dialog opens
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setProgress({
        phase: "ping_baseline",
        progress: 0,
        baselineRtt: 0,
        currentRtt: 0,
        bufferbloat: 0,
        message: "",
      });
      setError(null);
    }
  }, [isOpen]);

  const handleRunTest = async () => {
    if (!selectedServer || !pingTarget.trim()) return;

    try {
      setIsLoading(true);
      setError(null);
      setResult(null);
      
      // Reset progress to starting state
      setProgress({
        phase: "ping_baseline",
        progress: 0,
        baselineRtt: 0,
        currentRtt: 0,
        bufferbloat: 0,
        message: "",
      });
      
      // Prepare speedtest options based on selected server
      const speedtestOpts = {
        enableDownload: true,
        enableUpload: true,
        enablePacketLoss: false,
        enablePing: true,
        enableJitter: false,
        serverIds: [selectedServer.id],
        isScheduled: false,
        useIperf: selectedServer.isIperf,
        useLibrespeed: selectedServer.isLibrespeed || false,
        serverHost: selectedServer.host,
        serverName: selectedServer.name,
        serverCity: selectedServer.city || "",
      };

      const response = await fetch('/api/bufferbloat/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pingTarget: pingTarget.trim(),
          speedtestOpts,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.result) {
        // Set the final result
        setResult(data.result as BufferbloatResult);
        console.log("Bufferbloat test completed with result:", data.result);
      } else {
        console.log("Bufferbloat test started successfully");
      }
      
    } catch (error) {
      console.error("Bufferbloat test failed:", error);
      setError(error instanceof Error ? error.message : "An unexpected error occurred");
      setIsLoading(false);
    }
  };

  const renderPhaseDescription = (phase: string) => {
    switch (phase) {
      case "ping_baseline":
        return "Establishing baseline RTT (10 seconds of continuous ping)";
      case "speed_test":
        return "Running speed test while monitoring RTT changes";
      case "analysis":
        return "Analyzing bufferbloat impact and calculating results";
      case "complete":
        return "Bufferbloat test complete";
      default:
        return "Initializing test...";
    }
  };

  const getBufferbloatSeverity = (bufferbloat: number) => {
    if (bufferbloat < 100) return { level: "Good", color: "text-green-600", icon: "👍" };
    if (bufferbloat < 300) return { level: "Acceptable", color: "text-yellow-600", icon: "⚠️" };
    return { level: "Poor", color: "text-red-600", icon: "⛔" };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Bufferbloat Test
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Test Info */}
          <div className="flex items-start gap-3 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
            <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">
                What is Bufferbloat?
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                Bufferbloat occurs when network equipment buffers too much data, causing high latency during traffic bursts. 
                This test measures RTT increase during a speed test to identify bufferbloat issues.
              </p>
            </div>
          </div>

          {/* Server Selection Display */}
          {selectedServer && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Selected Speed Test Server
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedServer.name}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    {selectedServer.host} - {selectedServer.country}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ping Target Input */}
          <div className="space-y-2">
            <Label htmlFor="pingTarget">
              Ping Target IP Address
            </Label>
            <Input
              id="pingTarget"
              type="text"
              value={pingTarget}
              onChange={(e) => setPingTarget(e.target.value)}
              placeholder="8.8.8.8"
              disabled={isLoading}
              className="font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter an IP address to ping continuously during the test. Default is Google DNS (8.8.8.8).
            </p>
          </div>

          {/* Progress Display */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {renderPhaseDescription(progress.phase)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {Math.round(progress.progress)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(100, Math.max(0, progress.progress))}%` }}
                  />
                </div>
              </div>

              {/* Real-time metrics */}
              <div className="grid grid-cols-2 gap-4">
                {progress.baselineRtt && (
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                      {progress.baselineRtt.toFixed(1)}ms
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Baseline RTT
                    </div>
                  </div>
                )}
                
                {progress.currentRtt && (
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                      {progress.currentRtt.toFixed(1)}ms
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Current RTT
                    </div>
                  </div>
                )}
              </div>

              {progress.message && (
                <div className="text-sm text-center text-gray-600 dark:text-gray-400">
                  {progress.message}
                </div>
              )}
            </motion.div>
          )}

          {/* Results Display - Updated for separate download/upload results */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Baseline Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="h-5 w-5 text-blue-500" />
                    Baseline Measurements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100">
                        {result.baselineRtt.toFixed(1)}ms
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Baseline RTT
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100">
                        {result.baselineJitter.toFixed(1)}ms
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Baseline Jitter
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Download Results */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5 text-green-500" />
                    Download Phase Bufferbloat
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-mono font-bold text-gray-900 dark:text-gray-100 mb-2">
                      +{result.downloadBufferbloat.toFixed(1)}ms
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      RTT increase during download ({result.downloadBufferbloatPct.toFixed(1)}%)
                    </div>
                    
                    {(() => {
                      const severity = getBufferbloatSeverity(result.downloadBufferbloat);
                      return (
                        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border ${severity.color} bg-opacity-10`}>
                          <span className="text-lg">{severity.icon}</span>
                          <span className="font-medium">{result.downloadSeverity}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                        {result.downloadRtt.toFixed(1)}ms
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Download RTT
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                        {result.downloadJitter.toFixed(1)}ms
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Download Jitter
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Upload Results */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-orange-500" />
                    Upload Phase Bufferbloat
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-mono font-bold text-gray-900 dark:text-gray-100 mb-2">
                      +{result.uploadBufferbloat.toFixed(1)}ms
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      RTT increase during upload ({result.uploadBufferbloatPct.toFixed(1)}%)
                    </div>
                    
                    {(() => {
                      const severity = getBufferbloatSeverity(result.uploadBufferbloat);
                      return (
                        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border ${severity.color} bg-opacity-10`}>
                          <span className="text-lg">{severity.icon}</span>
                          <span className="font-medium">{result.uploadSeverity}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                        {result.uploadRtt.toFixed(1)}ms
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Upload RTT
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                        {result.uploadJitter.toFixed(1)}ms
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Upload Jitter
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary Information */}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                    Test completed at {new Date(result.timestamp).toLocaleString()}<br />
                    Target: {result.pingTarget}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Fallback Results Display for old progress-based results */}
          {!result && progress.phase === "complete" && progress.bufferbloat !== undefined && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-orange-500" />
                    Bufferbloat Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-mono font-bold text-gray-900 dark:text-gray-100 mb-2">
                      +{progress.bufferbloat.toFixed(1)}ms
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      RTT increase during speed test
                    </div>
                    
                    {(() => {
                      const severity = getBufferbloatSeverity(progress.bufferbloat);
                      return (
                        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border ${severity.color} bg-opacity-10`}>
                          <span className="text-lg">{severity.icon}</span>
                          <span className="font-medium">{severity.level}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                        {progress.baselineRtt?.toFixed(1)}ms
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Baseline RTT
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100">
                        {progress.currentRtt?.toFixed(1)}ms
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Peak RTT
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-red-600 dark:text-red-400">⚠️</div>
                <div>
                  <div className="font-medium text-red-800 dark:text-red-200">Test Failed</div>
                  <div className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              {isLoading ? "Cancel" : "Close"}
            </Button>
            
            {!isLoading && progress.phase !== "complete" && (
              <Button
                onClick={handleRunTest}
                disabled={!selectedServer || !pingTarget.trim()}
                className="min-w-[120px]"
              >
                <Activity className="h-4 w-4 mr-2" />
                Start Test
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
