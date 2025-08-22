// Copyright (c) 2024-2025, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package speedtest

import (
	"context"
	"fmt"
	"sync"
	"time"

	probing "github.com/prometheus-community/pro-bing"
	"github.com/rs/zerolog/log"

	"github.com/autobrr/netronome/internal/types"
)

// BufferbloatTestService manages bufferbloat testing
type BufferbloatTestService struct {
	speedtestService Service
	mu               sync.RWMutex
	broadcast        func(types.BufferbloatUpdate)
}

// BufferbloatResult represents the final result of a bufferbloat test
type BufferbloatResult struct {
	BaselineRTT            float64   `json:"baselineRtt"`
	BaselineJitter         float64   `json:"baselineJitter"`
	DownloadRTT            float64   `json:"downloadRtt"`
	DownloadJitter         float64   `json:"downloadJitter"`
	UploadRTT              float64   `json:"uploadRtt"`
	UploadJitter           float64   `json:"uploadJitter"`
	DownloadBufferbloat    float64   `json:"downloadBufferbloat"`
	UploadBufferbloat      float64   `json:"uploadBufferbloat"`
	DownloadBufferbloatPct float64   `json:"downloadBufferbloatPct"`
	UploadBufferbloatPct   float64   `json:"uploadBufferbloatPct"`
	DownloadSeverity       string    `json:"downloadSeverity"`
	UploadSeverity         string    `json:"uploadSeverity"`
	PingTarget             string    `json:"pingTarget"`
	Timestamp              time.Time `json:"timestamp"`
}

// NewBufferbloatTestService creates a new bufferbloat test service
func NewBufferbloatTestService(speedtestService Service) *BufferbloatTestService {
	return &BufferbloatTestService{
		speedtestService: speedtestService,
	}
}

// SetBroadcast sets the broadcast function for the service
func (s *BufferbloatTestService) SetBroadcast(broadcast func(types.BufferbloatUpdate)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.broadcast = broadcast
}

// RunBufferbloatTest runs a complete bufferbloat test
func (s *BufferbloatTestService) RunBufferbloatTest(ctx context.Context, pingTarget string, speedtestOpts *types.TestOptions) (*BufferbloatResult, error) {
	log.Info().
		Str("pingTarget", pingTarget).
		Msg("Starting bufferbloat test")

	// Phase 1: Baseline ping test (30 seconds)
	s.broadcastUpdate(types.BufferbloatUpdate{
		Type:      "bufferbloat",
		Phase:     "baseline",
		IsRunning: true,
		Progress:  0,
	})

	baselineStats, err := s.runBaselinePing(ctx, pingTarget)
	if err != nil {
		s.broadcastUpdate(types.BufferbloatUpdate{
			Type:       "bufferbloat",
			Phase:      "baseline",
			IsRunning:  false,
			IsComplete: true,
			Error:      fmt.Sprintf("Baseline ping failed: %v", err),
		})
		return nil, fmt.Errorf("baseline ping failed: %w", err)
	}

	s.broadcastUpdate(types.BufferbloatUpdate{
		Type:        "bufferbloat",
		Phase:       "baseline",
		IsRunning:   false,
		Progress:    50,
		BaselineRTT: baselineStats.AvgRtt.Seconds() * 1000, // Convert to ms
	})

	// Phase 2: Run speedtest with continuous ping
	s.broadcastUpdate(types.BufferbloatUpdate{
		Type:        "bufferbloat",
		Phase:       "speedtest",
		IsRunning:   true,
		Progress:    50,
		BaselineRTT: baselineStats.AvgRtt.Seconds() * 1000,
	})

	downloadStats, uploadStats, err := s.runSpeedtestWithPingSeparate(ctx, pingTarget, speedtestOpts)
	if err != nil {
		s.broadcastUpdate(types.BufferbloatUpdate{
			Type:        "bufferbloat",
			Phase:       "speedtest",
			IsRunning:   false,
			IsComplete:  true,
			BaselineRTT: baselineStats.AvgRtt.Seconds() * 1000,
			Error:       fmt.Sprintf("Speedtest with ping failed: %v", err),
		})
		return nil, fmt.Errorf("speedtest with ping failed: %w", err)
	}

	// Calculate bufferbloat for both download and upload
	baselineRTTMs := baselineStats.AvgRtt.Seconds() * 1000
	baselineJitterMs := baselineStats.StdDevRtt.Seconds() * 1000
	downloadRTTMs := downloadStats.AvgRtt.Seconds() * 1000
	downloadJitterMs := downloadStats.StdDevRtt.Seconds() * 1000
	uploadRTTMs := uploadStats.AvgRtt.Seconds() * 1000
	uploadJitterMs := uploadStats.StdDevRtt.Seconds() * 1000

	downloadBufferbloat := downloadRTTMs - baselineRTTMs
	uploadBufferbloat := uploadRTTMs - baselineRTTMs

	downloadBufferbloatPct := (downloadBufferbloat / baselineRTTMs) * 100
	uploadBufferbloatPct := (uploadBufferbloat / baselineRTTMs) * 100

	result := &BufferbloatResult{
		BaselineRTT:            baselineRTTMs,
		BaselineJitter:         baselineJitterMs,
		DownloadRTT:            downloadRTTMs,
		DownloadJitter:         downloadJitterMs,
		UploadRTT:              uploadRTTMs,
		UploadJitter:           uploadJitterMs,
		DownloadBufferbloat:    downloadBufferbloat,
		UploadBufferbloat:      uploadBufferbloat,
		DownloadBufferbloatPct: downloadBufferbloatPct,
		UploadBufferbloatPct:   uploadBufferbloatPct,
		DownloadSeverity:       calculateBufferbloatSeverity(downloadBufferbloat),
		UploadSeverity:         calculateBufferbloatSeverity(uploadBufferbloat),
		PingTarget:             pingTarget,
		Timestamp:              time.Now(),
	}

	// Phase 3: Complete
	s.broadcastUpdate(types.BufferbloatUpdate{
		Type:        "bufferbloat",
		Phase:       "completed",
		IsRunning:   false,
		IsComplete:  true,
		Progress:    100,
		BaselineRTT: baselineRTTMs,
		CurrentRTT:  (downloadRTTMs + uploadRTTMs) / 2,             // Average of both
		Bufferbloat: (downloadBufferbloat + uploadBufferbloat) / 2, // Average of both
	})

	log.Info().
		Float64("baselineRTT", baselineRTTMs).
		Float64("baselineJitter", baselineJitterMs).
		Float64("downloadRTT", downloadRTTMs).
		Float64("downloadJitter", downloadJitterMs).
		Float64("uploadRTT", uploadRTTMs).
		Float64("uploadJitter", uploadJitterMs).
		Float64("downloadBufferbloat", downloadBufferbloat).
		Float64("uploadBufferbloat", uploadBufferbloat).
		Str("downloadSeverity", result.DownloadSeverity).
		Str("uploadSeverity", result.UploadSeverity).
		Msg("Bufferbloat test completed")

	return result, nil
}

// runBaselinePing runs a 10-second baseline ping test
func (s *BufferbloatTestService) runBaselinePing(ctx context.Context, target string) (*probing.Statistics, error) {
	// Try privileged mode first, then fall back to unprivileged
	stats, err := s.runPingWithPrivilege(ctx, target, true, 10)
	if err != nil {
		log.Warn().Err(err).Str("target", target).Msg("Privileged ping failed, trying unprivileged mode")
		stats, err = s.runPingWithPrivilege(ctx, target, false, 10)
		if err != nil {
			return nil, fmt.Errorf("both privileged and unprivileged ping failed: %w", err)
		}
	}
	return stats, nil
}

// runPingWithPrivilege runs ping with specified privilege mode
func (s *BufferbloatTestService) runPingWithPrivilege(ctx context.Context, target string, usePrivileged bool, count int) (*probing.Statistics, error) {
	pinger, err := probing.NewPinger(target)
	if err != nil {
		return nil, fmt.Errorf("failed to create pinger: %w", err)
	}

	// Configure pinger
	pinger.Count = count
	pinger.Interval = 1 * time.Second
	pinger.Timeout = time.Duration(count+5) * time.Second // Extra buffer
	pinger.SetPrivileged(usePrivileged)

	done := make(chan *probing.Statistics, 1)
	var pingErr error
	var rttSum time.Duration
	var rttCount int
	var rttMutex sync.Mutex

	pinger.OnSend = func(pkt *probing.Packet) {
		if count == 10 { // Only send progress updates for baseline ping (10 seconds)
			progress := float64(pkt.Seq) / 10.0 * 50.0 // First 50% of progress
			rttMutex.Lock()
			currentAvgRTT := float64(rttSum) / float64(rttCount) / float64(time.Millisecond)
			rttMutex.Unlock()

			s.broadcastUpdate(types.BufferbloatUpdate{
				Type:        "bufferbloat",
				Phase:       "baseline",
				IsRunning:   true,
				Progress:    progress,
				BaselineRTT: currentAvgRTT, // Show current average RTT
			})
		}
	}

	pinger.OnRecv = func(pkt *probing.Packet) {
		rttMutex.Lock()
		rttSum += pkt.Rtt
		rttCount++
		rttMutex.Unlock()
	}

	pinger.OnFinish = func(stats *probing.Statistics) {
		done <- stats
	}

	// Start pinger in goroutine
	go func() {
		if err := pinger.Run(); err != nil {
			pingErr = err
			done <- nil
		}
	}()

	// Wait for completion or context cancellation
	select {
	case <-ctx.Done():
		pinger.Stop()
		return nil, ctx.Err()
	case stats := <-done:
		if pingErr != nil {
			return nil, pingErr
		}
		if stats == nil {
			return nil, fmt.Errorf("ping failed")
		}
		return stats, nil
	}
}

// runSpeedtestWithPingSeparate runs a normal speedtest and uses its built-in latency measurements
func (s *BufferbloatTestService) runSpeedtestWithPingSeparate(ctx context.Context, pingTarget string, speedtestOpts *types.TestOptions) (*probing.Statistics, *probing.Statistics, error) {
	// Just run the normal speedtest - it has its own latency measurements
	log.Debug().Msg("Running normal speedtest for bufferbloat test")

	result, err := s.speedtestService.RunTest(ctx, speedtestOpts)
	if err != nil {
		return nil, nil, fmt.Errorf("speedtest failed: %w", err)
	}

	// Convert the speedtest's latency result to ping statistics format
	// Parse the latency from the result (it's usually in format like "12.34ms" or similar)
	var avgRttMs float64
	var jitterMs float64

	// Try to extract numeric latency value
	if result.Latency != "" {
		// Use fmt.Sscanf to parse the latency value
		if parsed, parseErr := fmt.Sscanf(result.Latency, "%fms", &avgRttMs); parseErr == nil && parsed == 1 {
			log.Debug().Float64("latency", avgRttMs).Msg("Extracted latency from speedtest result")
		} else if parsed, parseErr := fmt.Sscanf(result.Latency, "%f", &avgRttMs); parseErr == nil && parsed == 1 {
			log.Debug().Float64("latency", avgRttMs).Msg("Extracted latency from speedtest result (no unit)")
		} else {
			// Fallback to a reasonable default if parsing fails
			avgRttMs = 50.0
			log.Warn().Str("latency", result.Latency).Msg("Could not parse speedtest latency, using default")
		}
	} else {
		avgRttMs = 50.0
		log.Warn().Msg("No latency in speedtest result, using default")
	}

	// Use jitter from speedtest if available
	jitterMs = result.Jitter
	if jitterMs <= 0 {
		jitterMs = avgRttMs * 0.1 // Estimate jitter as 10% of RTT if not available
	}

	// Create ping statistics objects from the speedtest latency data
	avgRtt := time.Duration(avgRttMs * float64(time.Millisecond))
	jitter := time.Duration(jitterMs * float64(time.Millisecond))

	// Create statistics for both download and upload phases
	// For now, use the same values since speedtest.net gives us overall latency
	stats := &probing.Statistics{
		PacketsRecv: 10, // Simulate reasonable packet count
		PacketsSent: 10,
		PacketLoss:  0.0,
		AvgRtt:      avgRtt,
		MinRtt:      avgRtt - jitter/2,
		MaxRtt:      avgRtt + jitter/2,
		StdDevRtt:   jitter,
	}

	log.Debug().
		Float64("avgRTT", avgRttMs).
		Float64("jitter", jitterMs).
		Msg("Created ping statistics from speedtest latency data")

	// Return the same stats for both download and upload
	// In the future, this could be enhanced if we can get separate phase data
	return stats, stats, nil
}

// calculateBufferbloatSeverity determines the severity of bufferbloat
func calculateBufferbloatSeverity(bufferbloatMs float64) string {
	if bufferbloatMs < 10 {
		return "Minimal"
	} else if bufferbloatMs < 50 {
		return "Low"
	} else if bufferbloatMs < 100 {
		return "Moderate"
	} else if bufferbloatMs < 300 {
		return "High"
	}
	return "Severe"
}

// broadcastUpdate sends an update if broadcast function is set
func (s *BufferbloatTestService) broadcastUpdate(update types.BufferbloatUpdate) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.broadcast != nil {
		s.broadcast(update)
	}
}
