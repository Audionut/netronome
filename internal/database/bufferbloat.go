// Copyright (c) 2024-2025, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package database

import (
	"context"
	"fmt"

	sq "github.com/Masterminds/squirrel"

	"github.com/autobrr/netronome/internal/config"
	"github.com/autobrr/netronome/internal/types"
)

// SaveBufferbloatTest saves a bufferbloat test result to the database
func (s *service) SaveBufferbloatTest(ctx context.Context, result types.BufferbloatResult) (*types.BufferbloatResult, error) {
	data := map[string]interface{}{
		"ping_target":              result.PingTarget,
		"baseline_rtt":             result.BaselineRTT,
		"baseline_jitter":          result.BaselineJitter,
		"download_rtt":             result.DownloadRTT,
		"download_jitter":          result.DownloadJitter,
		"upload_rtt":               result.UploadRTT,
		"upload_jitter":            result.UploadJitter,
		"download_bufferbloat":     result.DownloadBufferbloat,
		"upload_bufferbloat":       result.UploadBufferbloat,
		"download_bufferbloat_pct": result.DownloadBufferbloatPct,
		"upload_bufferbloat_pct":   result.UploadBufferbloatPct,
		"download_severity":        result.DownloadSeverity,
		"upload_severity":          result.UploadSeverity,
		"download_speed":           result.DownloadSpeed,
		"upload_speed":             result.UploadSpeed,
		"is_scheduled":             false, // Bufferbloat tests are manual for now
	}

	// Use provided created_at if available, otherwise use current timestamp
	if !result.Timestamp.IsZero() {
		data["created_at"] = result.Timestamp
	} else {
		data["created_at"] = sq.Expr("CURRENT_TIMESTAMP")
	}

	var id int64

	switch s.config.Type {
	case config.Postgres:
		query := s.sqlBuilder.Insert("bufferbloat_tests").
			SetMap(data).
			Suffix("RETURNING id")

		sqlStr, args, err := query.ToSql()
		if err != nil {
			return nil, fmt.Errorf("failed to build query: %w", err)
		}

		err = s.db.QueryRowContext(ctx, sqlStr, args...).Scan(&id)
		if err != nil {
			return nil, fmt.Errorf("failed to save bufferbloat test: %w", err)
		}

	case config.SQLite:
		res, err := s.insert(ctx, "bufferbloat_tests", data)
		if err != nil {
			return nil, fmt.Errorf("failed to save bufferbloat test: %w", err)
		}

		id, err = res.LastInsertId()
		if err != nil {
			return nil, fmt.Errorf("failed to get last insert ID: %w", err)
		}
	}

	result.ID = id
	return &result, nil
}

// GetBufferbloatTests retrieves bufferbloat test results with pagination and time filtering
func (s *service) GetBufferbloatTests(ctx context.Context, timeRange string, page, limit int) (*types.PaginatedBufferbloatTests, error) {
	baseQuery := s.sqlBuilder.Select().From("bufferbloat_tests")

	if timeRange != "all" {
		var timeExpr string
		switch s.config.Type {
		case config.Postgres:
			switch timeRange {
			case "24h", "1d":
				timeExpr = "NOW() - INTERVAL '1 day'"
			case "3d":
				timeExpr = "NOW() - INTERVAL '3 days'"
			case "week", "1w":
				timeExpr = "NOW() - INTERVAL '7 days'"
			case "month", "1m":
				timeExpr = "NOW() - INTERVAL '1 month'"
			}
		case config.SQLite:
			switch timeRange {
			case "24h", "1d":
				timeExpr = "datetime('now', '-1 day')"
			case "3d":
				timeExpr = "datetime('now', '-3 days')"
			case "week", "1w":
				timeExpr = "datetime('now', '-7 days')"
			case "month", "1m":
				timeExpr = "datetime('now', '-1 month')"
			}
		}
		if timeExpr != "" {
			baseQuery = baseQuery.Where("created_at >= " + timeExpr)
		}
	}

	// Get total count
	countQuery := baseQuery.Columns("COUNT(*)")
	var total int
	err := countQuery.RunWith(s.db).QueryRowContext(ctx).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("failed to get total count: %w", err)
	}

	// Get paginated results
	dataQuery := baseQuery.Columns(
		"id",
		"ping_target",
		"baseline_rtt",
		"baseline_jitter",
		"download_rtt",
		"download_jitter",
		"upload_rtt",
		"upload_jitter",
		"download_bufferbloat",
		"upload_bufferbloat",
		"download_bufferbloat_pct",
		"upload_bufferbloat_pct",
		"download_severity",
		"upload_severity",
		"download_speed",
		"upload_speed",
		"is_scheduled",
		"created_at",
	).
		OrderBy("created_at DESC").
		Limit(uint64(limit)).
		Offset(uint64((page - 1) * limit))

	rows, err := dataQuery.RunWith(s.db).QueryContext(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to query bufferbloat tests: %w", err)
	}
	defer rows.Close()

	results := make([]types.BufferbloatResult, 0)
	for rows.Next() {
		var result types.BufferbloatResult
		err := rows.Scan(
			&result.ID,
			&result.PingTarget,
			&result.BaselineRTT,
			&result.BaselineJitter,
			&result.DownloadRTT,
			&result.DownloadJitter,
			&result.UploadRTT,
			&result.UploadJitter,
			&result.DownloadBufferbloat,
			&result.UploadBufferbloat,
			&result.DownloadBufferbloatPct,
			&result.UploadBufferbloatPct,
			&result.DownloadSeverity,
			&result.UploadSeverity,
			&result.DownloadSpeed,
			&result.UploadSpeed,
			&result.IsScheduled,
			&result.Timestamp,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan bufferbloat test result: %w", err)
		}
		results = append(results, result)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating bufferbloat test results: %w", err)
	}

	return &types.PaginatedBufferbloatTests{
		Data:  results,
		Total: total,
		Page:  page,
		Limit: limit,
	}, nil
}
