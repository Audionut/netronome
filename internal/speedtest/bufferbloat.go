// Copyright (c) 2024-2025, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package speedtest

import (
	"context"
	"fmt"
	"math"
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
	DownloadSpeed          float64   `json:"downloadSpeed"` // Mbps
	UploadSpeed            float64   `json:"uploadSpeed"`   // Mbps
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
		Progress:    100,
		BaselineRTT: baselineStats.AvgRtt.Seconds() * 1000, // Convert to ms
	})

	// Phase 2: Run speedtest with continuous ping
	s.broadcastUpdate(types.BufferbloatUpdate{
		Type:        "bufferbloat",
		Phase:       "download",
		IsRunning:   true,
		BaselineRTT: baselineStats.AvgRtt.Seconds() * 1000,
	})

	downloadStats, uploadStats, downloadSpeed, uploadSpeed, err := s.runSpeedtestWithPingSeparate(ctx, pingTarget, speedtestOpts)
	if err != nil {
		s.broadcastUpdate(types.BufferbloatUpdate{
			Type:        "bufferbloat",
			Phase:       "download",
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
		DownloadSpeed:          downloadSpeed, // Add actual download speed
		UploadSpeed:            uploadSpeed,   // Add actual upload speed
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

// runSpeedtestWithPingSeparate runs speedtest with continuous ICMP ping during both download and upload phases
func (s *BufferbloatTestService) runSpeedtestWithPingSeparate(ctx context.Context, pingTarget string, speedtestOpts *types.TestOptions) (*probing.Statistics, *probing.Statistics, float64, float64, error) {
	var downloadStats, uploadStats *probing.Statistics
	var downloadSpeed, uploadSpeed float64
	var wg sync.WaitGroup
	var testErr error
	var pingErr error

	// Create contexts for each phase
	downloadCtx, downloadCancel := context.WithCancel(ctx)
	uploadCtx, uploadCancel := context.WithCancel(ctx)
	defer downloadCancel()
	defer uploadCancel()

	// Channels to collect ping statistics
	downloadStatsChan := make(chan *probing.Statistics, 1)
	uploadStatsChan := make(chan *probing.Statistics, 1)

	// Start the speedtest in a separate goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Debug().Msg("Starting speedtest for bufferbloat measurement")

		// Create separate test options for download and upload phases
		downloadOpts := *speedtestOpts
		downloadOpts.EnableUpload = false
		downloadOpts.EnableDownload = true

		uploadOpts := *speedtestOpts
		uploadOpts.EnableUpload = true
		uploadOpts.EnableDownload = false

		// Run download phase
		s.broadcastUpdate(types.BufferbloatUpdate{
			Type:      "bufferbloat",
			Phase:     "download",
			IsRunning: true,
		})

		downloadResult, err := s.speedtestService.RunTest(downloadCtx, &downloadOpts)
		if err != nil && err != context.Canceled {
			testErr = fmt.Errorf("download speedtest failed: %w", err)
			downloadCancel()
			return
		}
		if downloadResult != nil {
			downloadSpeed = downloadResult.DownloadSpeed
		}

		// Signal download phase complete, cancel download ping
		downloadCancel()

		// Brief pause between phases
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}

		// Run upload phase
		s.broadcastUpdate(types.BufferbloatUpdate{
			Type:      "bufferbloat",
			Phase:     "upload",
			IsRunning: true,
		})

		uploadResult, err := s.speedtestService.RunTest(uploadCtx, &uploadOpts)
		if err != nil && err != context.Canceled {
			testErr = fmt.Errorf("upload speedtest failed: %w", err)
		}
		if uploadResult != nil {
			uploadSpeed = uploadResult.UploadSpeed
		}

		// Signal upload phase complete
		uploadCancel()
	}()

	// Start download phase ping in a separate goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Debug().Msg("Starting continuous ping during download phase")
		stats, err := s.runContinuousPing(downloadCtx, pingTarget, "download")
		if err != nil && err != context.Canceled {
			pingErr = fmt.Errorf("download ping failed: %w", err)
			return
		}
		if stats != nil {
			downloadStatsChan <- stats
		}
	}()

	// Start upload phase ping in a separate goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Wait for download phase to complete
		<-downloadCtx.Done()

		log.Debug().Msg("Starting continuous ping during upload phase")
		stats, err := s.runContinuousPing(uploadCtx, pingTarget, "upload")
		if err != nil && err != context.Canceled {
			pingErr = fmt.Errorf("upload ping failed: %w", err)
			return
		}
		if stats != nil {
			uploadStatsChan <- stats
		}
	}()

	// Wait for all goroutines to complete
	wg.Wait()

	// Check for errors
	if testErr != nil {
		return nil, nil, 0.0, 0.0, testErr
	}
	if pingErr != nil {
		return nil, nil, 0.0, 0.0, pingErr
	}

	// Collect ping statistics
	select {
	case downloadStats = <-downloadStatsChan:
	case <-time.After(2 * time.Second):
		return nil, nil, 0.0, 0.0, fmt.Errorf("timeout waiting for download ping statistics")
	}

	select {
	case uploadStats = <-uploadStatsChan:
	case <-time.After(2 * time.Second):
		return nil, nil, 0.0, 0.0, fmt.Errorf("timeout waiting for upload ping statistics")
	}

	if downloadStats == nil {
		return nil, nil, 0.0, 0.0, fmt.Errorf("no download ping statistics received")
	}
	if uploadStats == nil {
		return nil, nil, 0.0, 0.0, fmt.Errorf("no upload ping statistics received")
	}

	log.Debug().
		Float64("downloadRTT", downloadStats.AvgRtt.Seconds()*1000).
		Float64("uploadRTT", uploadStats.AvgRtt.Seconds()*1000).
		Msg("Completed speedtest with continuous ping measurement")

	return downloadStats, uploadStats, downloadSpeed, uploadSpeed, nil
}

// runContinuousPing runs continuous ping for a specific phase
func (s *BufferbloatTestService) runContinuousPing(ctx context.Context, target, phase string) (*probing.Statistics, error) {
	// Try privileged mode first, then fall back to unprivileged
	stats, err := s.runContinuousPingWithPrivilege(ctx, target, phase, true)
	if err != nil {
		log.Warn().Err(err).Str("target", target).Str("phase", phase).Msg("Privileged continuous ping failed, trying unprivileged mode")
		stats, err = s.runContinuousPingWithPrivilege(ctx, target, phase, false)
		if err != nil {
			return nil, fmt.Errorf("both privileged and unprivileged continuous ping failed: %w", err)
		}
	}
	return stats, nil
}

// runContinuousPingWithPrivilege runs continuous ping with specified privilege mode for a phase
func (s *BufferbloatTestService) runContinuousPingWithPrivilege(ctx context.Context, target, phase string, usePrivileged bool) (*probing.Statistics, error) {
	pinger, err := probing.NewPinger(target)
	if err != nil {
		return nil, fmt.Errorf("failed to create pinger: %w", err)
	}

	// Configure pinger for continuous operation
	pinger.Count = -1                        // Continuous ping
	pinger.Interval = 100 * time.Millisecond // Faster ping rate for better RTT tracking
	pinger.Timeout = 30 * time.Second        // Long timeout for continuous operation
	pinger.SetPrivileged(usePrivileged)

	var rttSum time.Duration
	var rttCount int
	var rttMin, rttMax time.Duration
	var rttSquaredSum float64
	var rttMutex sync.Mutex

	// Initialize min/max tracking
	rttMin = time.Hour // Very large initial value
	rttMax = 0

	pinger.OnRecv = func(pkt *probing.Packet) {
		rttMutex.Lock()
		defer rttMutex.Unlock()

		rttSum += pkt.Rtt
		rttCount++

		// Calculate squared sum in milliseconds for proper variance calculation
		rttMs := float64(pkt.Rtt) / float64(time.Millisecond)
		rttSquaredSum += rttMs * rttMs

		if pkt.Rtt < rttMin {
			rttMin = pkt.Rtt
		}
		if pkt.Rtt > rttMax {
			rttMax = pkt.Rtt
		}

		// Broadcast real-time RTT updates
		currentAvgRTT := float64(rttSum) / float64(rttCount) / float64(time.Millisecond)
		s.broadcastUpdate(types.BufferbloatUpdate{
			Type:       "bufferbloat",
			Phase:      phase,
			IsRunning:  true,
			CurrentRTT: currentAvgRTT,
		})
	}

	// Start pinger in goroutine
	go func() {
		if err := pinger.Run(); err != nil && err != context.Canceled {
			log.Warn().Err(err).Str("phase", phase).Msg("Ping error during continuous ping")
		}
	}()

	// Wait for context cancellation (when speedtest phase completes)
	<-ctx.Done()
	pinger.Stop()

	// Calculate final statistics
	rttMutex.Lock()
	defer rttMutex.Unlock()

	if rttCount == 0 {
		return nil, fmt.Errorf("no ping responses received during %s phase", phase)
	}

	avgRtt := time.Duration(int64(rttSum) / int64(rttCount))

	// Calculate standard deviation (jitter) properly
	avgRttMs := float64(avgRtt) / float64(time.Millisecond) // Convert to milliseconds as float64
	varianceMs := (rttSquaredSum / float64(rttCount)) - (avgRttMs * avgRttMs)
	if varianceMs < 0 {
		varianceMs = 0
	}
	stdDevMs := math.Sqrt(varianceMs)
	stdDev := time.Duration(stdDevMs * float64(time.Millisecond)) // Convert back to time.Duration

	stats := &probing.Statistics{
		PacketsRecv: rttCount,
		PacketsSent: rttCount, // Assume no packet loss for simplicity
		PacketLoss:  0.0,
		AvgRtt:      avgRtt,
		MinRtt:      rttMin,
		MaxRtt:      rttMax,
		StdDevRtt:   stdDev,
	}

	log.Debug().
		Str("phase", phase).
		Float64("avgRTT", avgRtt.Seconds()*1000).
		Float64("minRTT", rttMin.Seconds()*1000).
		Float64("maxRTT", rttMax.Seconds()*1000).
		Float64("jitter", stdDev.Seconds()*1000).
		Int("packetCount", rttCount).
		Msg("Continuous ping phase completed")

	return stats, nil
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
