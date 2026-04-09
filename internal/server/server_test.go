package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/version"
	"github.com/gin-gonic/gin"
)

func TestRegisterBaseRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	oldVersion := version.Version
	oldBuildDate := version.BuildDate
	oldCommitID := version.CommitID
	oldEnableVersionCheck := common.EnableVersionCheck
	defer func() {
		version.Version = oldVersion
		version.BuildDate = oldBuildDate
		version.CommitID = oldCommitID
		common.EnableVersionCheck = oldEnableVersionCheck
	}()

	version.Version = "v1.2.3"
	version.BuildDate = "2026-03-27"
	version.CommitID = "abc123"
	common.EnableVersionCheck = false

	r := gin.New()
	registerBaseRoutes(&r.RouterGroup)

	t.Run("healthz", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}
		if got := strings.TrimSpace(rec.Body.String()); got != `{"status":"ok"}` {
			t.Fatalf("body = %q, want %q", got, `{"status":"ok"}`)
		}
	})

	t.Run("version", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/version", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}

		var got map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("json.Unmarshal() error = %v", err)
		}
		if got["version"] != "v1.2.3" || got["buildDate"] != "2026-03-27" || got["commitId"] != "abc123" {
			t.Fatalf("unexpected version payload: %#v", got)
		}
	})

	t.Run("check update", func(t *testing.T) {
		version.Version = "dev"

		req := httptest.NewRequest(
			http.MethodPost,
			"/api/v1/version/check-update",
			bytes.NewBufferString(`{"force":true}`),
		)
		req.Header.Set("Content-Type", "application/json")

		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
		}

		var got map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("json.Unmarshal() error = %v", err)
		}
		if got["currentVersion"] != "dev" || got["hasNewVersion"] != false {
			t.Fatalf("unexpected check-update payload: %#v", got)
		}
		if got["comparison"] != string(version.UpdateComparisonUncomparable) {
			t.Fatalf("unexpected comparison payload: %#v", got)
		}
	})
}

func TestSetupStatic(t *testing.T) {
	gin.SetMode(gin.TestMode)

	oldBase := common.Base
	oldEnableAnalytics := common.EnableAnalytics
	defer func() {
		common.Base = oldBase
		common.EnableAnalytics = oldEnableAnalytics
	}()

	common.Base = "/kite"
	common.EnableAnalytics = true

	r := gin.New()
	setupStatic(r)

	t.Run("redirects root to base", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusFound {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
		}
		if location := rec.Header().Get("Location"); location != "/kite/" {
			t.Fatalf("Location = %q, want %q", location, "/kite/")
		}
	})

	t.Run("serves index for ui routes with base and analytics injected", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/kite/overview", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}
		body := rec.Body.String()
		if !strings.Contains(body, `window.__dynamic_base__="/kite"`) {
			t.Fatalf("body missing dynamic base injection")
		}
		if !strings.Contains(body, "cloud.umami.is/script.js") {
			t.Fatalf("body missing analytics injection")
		}
	})

	t.Run("returns api 404 for missing api route", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/kite/api/missing", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
		}
		if got := strings.TrimSpace(rec.Body.String()); got != `{"error":"API endpoint not found"}` {
			t.Fatalf("body = %q, want %q", got, `{"error":"API endpoint not found"}`)
		}
	})
}
