package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-gonic/gin"
)

func TestDesktopRoutesExcludeLegacyAuthAndInit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupRouteTestDB(t)

	r := gin.New()
	r.RedirectTrailingSlash = false
	setupAPIRouter(&r.RouterGroup, &cluster.ClusterManager{})

	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/init_check"},
		{http.MethodGet, "/api/auth/login"},
		{http.MethodGet, "/api/auth/user"},
		{http.MethodPost, "/api/v1/admin/users/create_super_user"},
		{http.MethodGet, "/api/v1/admin/general-setting/"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s %s status = %d, want %d", tc.method, tc.path, rec.Code, http.StatusNotFound)
		}
	}
}

func TestDesktopPreferenceAndSettingRoutesExist(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupRouteTestDB(t)

	r := gin.New()
	r.RedirectTrailingSlash = false
	setupAPIRouter(&r.RouterGroup, &cluster.ClusterManager{})

	for _, tc := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/preferences/favorites"},
		{http.MethodPost, "/api/v1/preferences/favorites"},
		{http.MethodPost, "/api/v1/preferences/favorites/remove"},
		{http.MethodGet, "/api/v1/preferences/sidebar"},
		{http.MethodPut, "/api/v1/preferences/sidebar"},
		{http.MethodGet, "/api/v1/settings/general"},
		{http.MethodPut, "/api/v1/settings/general"},
		{http.MethodPost, "/api/v1/settings/general/models"},
		{http.MethodPost, "/api/v1/settings/general/test"},
		{http.MethodPost, "/api/v1/admin/clusters/test"},
		{http.MethodGet, "/api/v1/ai/sessions"},
		{http.MethodGet, "/api/v1/ai/sessions/test-session"},
		{http.MethodPut, "/api/v1/ai/sessions/test-session"},
		{http.MethodDelete, "/api/v1/ai/sessions/test-session"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code == http.StatusNotFound && strings.Contains(rec.Body.String(), "404 page not found") {
			t.Fatalf("%s %s returned 404, want registered route", tc.method, tc.path)
		}
	}
}

func setupRouteTestDB(t *testing.T) {
	t.Helper()

	tempDir := t.TempDir()
	common.DBType = "sqlite"
	common.DBDSN = filepath.Join(tempDir, "routes-test.db")
	model.InitDB()

	t.Cleanup(func() {
		_ = os.RemoveAll(tempDir)
	})
}
