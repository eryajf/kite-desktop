package cluster

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-gonic/gin"
)

func TestFormatClusterConnectionError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		err         error
		contains    string
		detail      string
		notContains string
	}{
		{
			name:     "timeout",
			err:      context.DeadlineExceeded,
			contains: "timed out after 12s",
			detail:   context.DeadlineExceeded.Error(),
		},
		{
			name:     "dns",
			err:      errors.New("lookup demo.example.invalid: no such host"),
			contains: "Failed to resolve the Kubernetes API Server host.",
			detail:   "lookup demo.example.invalid: no such host",
		},
		{
			name:     "tls",
			err:      errors.New("x509: certificate signed by unknown authority"),
			contains: "TLS certificate validation failed.",
			detail:   "x509: certificate signed by unknown authority",
		},
		{
			name:     "default passthrough",
			err:      errors.New("plain failure"),
			contains: "Cluster connection test failed.",
			detail:   "plain failure",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := formatClusterConnectionError(tt.err)
			if got == nil {
				t.Fatal("expected formatted error, got nil")
			}
			if !strings.Contains(got.Error(), tt.contains) {
				t.Fatalf("formatted error = %q, want substring %q", got.Error(), tt.contains)
			}
			var connectionErr *clusterConnectionError
			if !errors.As(got, &connectionErr) {
				t.Fatalf("expected clusterConnectionError, got %T", got)
			}
			if connectionErr.Code == "" {
				t.Fatalf("expected error code, got %+v", connectionErr)
			}
			if tt.detail != "" && !strings.Contains(connectionErr.Detail, tt.detail) {
				t.Fatalf("error detail = %q, want substring %q", connectionErr.Detail, tt.detail)
			}
			if tt.notContains != "" && strings.Contains(connectionErr.Detail, tt.notContains) {
				t.Fatalf("error detail = %q, unexpected substring %q", connectionErr.Detail, tt.notContains)
			}
		})
	}
}

func TestTestClusterConnectionSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)

	originalTester := clusterConnectionTester
	t.Cleanup(func() {
		clusterConnectionTester = originalTester
	})

	clusterConnectionTester = func(cluster *model.Cluster) (*ClientSet, error) {
		if cluster.Name != "demo" {
			t.Fatalf("cluster.Name = %q, want %q", cluster.Name, "demo")
		}
		if string(cluster.Config) != "apiVersion: v1" {
			t.Fatalf("cluster.Config = %q, want kubeconfig body", string(cluster.Config))
		}
		return &ClientSet{Version: "v1.30.0"}, nil
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/v1/admin/clusters/test",
		strings.NewReader(`{"name":"demo","config":"apiVersion: v1"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	(&ClusterManager{}).TestClusterConnection(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var response struct {
		Message string `json:"message"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.Version != "v1.30.0" {
		t.Fatalf("version = %q, want %q", response.Version, "v1.30.0")
	}
}

func TestTestClusterConnectionReturnsReadableError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	originalTester := clusterConnectionTester
	t.Cleanup(func() {
		clusterConnectionTester = originalTester
	})

	clusterConnectionTester = func(cluster *model.Cluster) (*ClientSet, error) {
		return nil, &clusterConnectionError{
			Code:    clusterConnectionErrorTimeout,
			Message: "Connection test timed out after 12s.",
			Detail:  "context deadline exceeded",
		}
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/v1/admin/clusters/test",
		strings.NewReader(`{"name":"demo","config":"apiVersion: v1"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	(&ClusterManager{}).TestClusterConnection(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
	var response struct {
		Error       string `json:"error"`
		ErrorCode   string `json:"errorCode"`
		ErrorDetail string `json:"errorDetail"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response.ErrorCode != clusterConnectionErrorTimeout {
		t.Fatalf("errorCode = %q, want %q", response.ErrorCode, clusterConnectionErrorTimeout)
	}
	if !strings.Contains(response.Error, "timed out") {
		t.Fatalf("error = %q, want timeout hint", response.Error)
	}
	if response.ErrorDetail == "" {
		t.Fatalf("expected errorDetail, got empty response: %+v", response)
	}
}

func TestTestClusterConnectionUsesExistingConfigWhenEditing(t *testing.T) {
	gin.SetMode(gin.TestMode)

	restoreDB := useClusterManagerTestDB(t)
	defer restoreDB()

	cluster := &model.Cluster{
		Name:          "demo",
		Config:        model.SecretString("apiVersion: v1\nclusters: []"),
		PrometheusURL: "http://old-prometheus.example",
		Enable:        true,
	}
	if err := model.AddCluster(cluster); err != nil {
		t.Fatalf("add cluster: %v", err)
	}

	originalTester := clusterConnectionTester
	t.Cleanup(func() {
		clusterConnectionTester = originalTester
	})

	clusterConnectionTester = func(cluster *model.Cluster) (*ClientSet, error) {
		if cluster.Name != "demo" {
			t.Fatalf("cluster.Name = %q, want %q", cluster.Name, "demo")
		}
		if string(cluster.Config) != "apiVersion: v1\nclusters: []" {
			t.Fatalf("cluster.Config = %q, want persisted config", string(cluster.Config))
		}
		if cluster.PrometheusURL != "http://new-prometheus.example" {
			t.Fatalf("cluster.PrometheusURL = %q, want request override", cluster.PrometheusURL)
		}
		return &ClientSet{Version: "v1.31.0"}, nil
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/v1/admin/clusters/test",
		strings.NewReader(`{"id":`+strconv.FormatUint(uint64(cluster.ID), 10)+`,"name":"demo","prometheusURL":"http://new-prometheus.example"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	(&ClusterManager{}).TestClusterConnection(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
}
