// Copyright (c) 2024-2025, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"

	"github.com/autobrr/netronome/internal/database"
	"github.com/autobrr/netronome/internal/logger"
	"github.com/autobrr/netronome/internal/speedtest"
	"github.com/autobrr/netronome/internal/types"
)

type BufferbloatHandler struct {
	log     zerolog.Logger
	db      database.Service
	service *speedtest.BufferbloatTestService
}

func NewBufferbloatHandler(db database.Service, service *speedtest.BufferbloatTestService) *BufferbloatHandler {
	return &BufferbloatHandler{
		log:     logger.Get().With().Str("module", "bufferbloat_handler").Logger(),
		db:      db,
		service: service,
	}
}

func (h *BufferbloatHandler) RunBufferbloatTest(c *gin.Context) {
	var req struct {
		PingTarget    string             `json:"pingTarget" binding:"required"`
		SpeedtestOpts *types.TestOptions `json:"speedtestOpts" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		h.log.Error().Err(err).Msg("Failed to bind request")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	h.log.Info().
		Str("pingTarget", req.PingTarget).
		Msg("Starting bufferbloat test")

	// Create context with timeout (5 minutes should be enough for baseline + speedtest)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()

	// Run the bufferbloat test
	result, err := h.service.RunBufferbloatTest(ctx, req.PingTarget, req.SpeedtestOpts)
	if err != nil {
		h.log.Error().Err(err).Msg("Bufferbloat test failed")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Bufferbloat test failed"})
		return
	}

	h.log.Info().
		Float64("baselineRTT", result.BaselineRTT).
		Float64("baselineJitter", result.BaselineJitter).
		Float64("downloadRTT", result.DownloadRTT).
		Float64("downloadJitter", result.DownloadJitter).
		Float64("uploadRTT", result.UploadRTT).
		Float64("uploadJitter", result.UploadJitter).
		Float64("downloadBufferbloat", result.DownloadBufferbloat).
		Float64("uploadBufferbloat", result.UploadBufferbloat).
		Str("downloadSeverity", result.DownloadSeverity).
		Str("uploadSeverity", result.UploadSeverity).
		Msg("Bufferbloat test completed successfully")

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}
