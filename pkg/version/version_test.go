package version

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/common"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestParseSemver(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "with v prefix", input: "v1.2.3", want: "1.2.3"},
		{name: "without v prefix", input: "1.2.3", want: "1.2.3"},
		{name: "invalid", input: "not-a-version", wantErr: true},
		{name: "empty", input: "   ", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseSemver(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.String() != tt.want {
				t.Fatalf("unexpected version: want %q, got %q", tt.want, got.String())
			}
		})
	}
}

func TestGetVersionWithoutVersionCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)

	origVersion := Version
	origBuildDate := BuildDate
	origCommitID := CommitID
	origEnableVersionCheck := common.EnableVersionCheck
	t.Cleanup(func() {
		Version = origVersion
		BuildDate = origBuildDate
		CommitID = origCommitID
		common.EnableVersionCheck = origEnableVersionCheck
	})

	Version = "1.2.3"
	BuildDate = "2026-03-27"
	CommitID = "abc123"
	common.EnableVersionCheck = false

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest("GET", "/version", nil)

	GetVersion(c)

	if recorder.Code != 200 {
		t.Fatalf("unexpected status code: %d", recorder.Code)
	}

	var got VersionInfo
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if got.Version != "1.2.3" || got.BuildDate != "2026-03-27" || got.CommitID != "abc123" {
		t.Fatalf("unexpected version info: %#v", got)
	}
	if got.HasNew || got.Release != "" {
		t.Fatalf("unexpected update fields: %#v", got)
	}
}

func TestGetVersionWithCachedUpdateResult(t *testing.T) {
	gin.SetMode(gin.TestMode)

	origVersion := Version
	origBuildDate := BuildDate
	origCommitID := CommitID
	origEnableVersionCheck := common.EnableVersionCheck
	origCachedUpdateResult := cachedUpdateResult
	origLastUpdateFetch := lastUpdateFetch
	t.Cleanup(func() {
		Version = origVersion
		BuildDate = origBuildDate
		CommitID = origCommitID
		common.EnableVersionCheck = origEnableVersionCheck
		cachedUpdateResult = origCachedUpdateResult
		lastUpdateFetch = origLastUpdateFetch
	})

	Version = "1.2.3"
	BuildDate = "2026-03-27"
	CommitID = "abc123"
	common.EnableVersionCheck = true
	cachedUpdateResult = updateCheckResult{
		hasNew:        true,
		latestVersion: "1.2.4",
		releaseURL:    "https://example.com/releases/v1.2.4",
		checkedAt:     time.Now(),
	}
	lastUpdateFetch = time.Now()

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest("GET", "/version", nil)

	GetVersion(c)

	if recorder.Code != 200 {
		t.Fatalf("unexpected status code: %d", recorder.Code)
	}

	var got VersionInfo
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if !got.HasNew || got.Release != "https://example.com/releases/v1.2.4" {
		t.Fatalf("unexpected update fields: %#v", got)
	}
}

func TestCheckForUpdateShortCircuitsWithoutNetwork(t *testing.T) {
	origCachedUpdateResult := cachedUpdateResult
	origLastUpdateFetch := lastUpdateFetch
	t.Cleanup(func() {
		cachedUpdateResult = origCachedUpdateResult
		lastUpdateFetch = origLastUpdateFetch
	})

	cachedUpdateResult = updateCheckResult{
		hasNew:        true,
		latestVersion: "1.2.4",
		releaseURL:    "https://example.com/releases/v1.2.4",
		checkedAt:     time.Now(),
	}
	lastUpdateFetch = time.Now()

	got, err := checkForUpdate(context.Background(), "1.2.3", false)
	if err != nil {
		t.Fatalf("checkForUpdate() error = %v", err)
	}
	if !got.hasNew || got.releaseURL != "https://example.com/releases/v1.2.4" || got.latestVersion != "1.2.4" {
		t.Fatalf("unexpected cached result: %#v", got)
	}
}

func TestCheckForUpdateSkipsBlankAndDevVersions(t *testing.T) {
	got, err := checkForUpdate(context.Background(), "   ", false)
	if err != nil {
		t.Fatalf("blank version returned error: %v", err)
	}
	if got != (updateCheckResult{}) {
		t.Fatalf("blank version result = %#v, want zero value", got)
	}
	got, err = checkForUpdate(context.Background(), "dev", false)
	if err != nil {
		t.Fatalf("dev version returned error: %v", err)
	}
	if got != (updateCheckResult{}) {
		t.Fatalf("dev version result = %#v, want zero value", got)
	}
}

func TestCheckForUpdateFetchesLatestRelease(t *testing.T) {
	origAPI := githubLatestReleaseAPI
	origClient := versionCheckClient
	origCachedUpdateResult := cachedUpdateResult
	origLastUpdateFetch := lastUpdateFetch
	t.Cleanup(func() {
		githubLatestReleaseAPI = origAPI
		versionCheckClient = origClient
		cachedUpdateResult = origCachedUpdateResult
		lastUpdateFetch = origLastUpdateFetch
	})

	versionCheckClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"Content-Type": []string{"application/json"},
				},
				Body: io.NopCloser(
					bytes.NewBufferString(`{"tag_name":"v1.2.4","html_url":"https://github.com/eryajf/kite-desktop/releases/tag/v1.2.4"}`),
				),
			}, nil
		}),
	}
	githubLatestReleaseAPI = "https://example.com/releases/latest"
	cachedUpdateResult = updateCheckResult{}
	lastUpdateFetch = time.Time{}

	got, err := checkForUpdate(context.Background(), "1.2.3", true)
	if err != nil {
		t.Fatalf("checkForUpdate() error = %v", err)
	}
	if !got.hasNew {
		t.Fatalf("expected hasNew=true, got %#v", got)
	}
	if got.latestVersion != "1.2.4" {
		t.Fatalf("latestVersion = %q, want %q", got.latestVersion, "1.2.4")
	}
	if got.releaseURL != "https://github.com/eryajf/kite-desktop/releases/tag/v1.2.4" {
		t.Fatalf("releaseURL = %q, want release url", got.releaseURL)
	}
	if got.checkedAt.IsZero() {
		t.Fatalf("checkedAt should not be zero")
	}
}

func TestCheckUpdateReturnsLatestRelease(t *testing.T) {
	gin.SetMode(gin.TestMode)

	origVersion := Version
	origAPI := githubLatestReleaseAPI
	origClient := versionCheckClient
	origCachedUpdateResult := cachedUpdateResult
	origLastUpdateFetch := lastUpdateFetch
	t.Cleanup(func() {
		Version = origVersion
		githubLatestReleaseAPI = origAPI
		versionCheckClient = origClient
		cachedUpdateResult = origCachedUpdateResult
		lastUpdateFetch = origLastUpdateFetch
	})

	Version = "v1.2.3"
	versionCheckClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header: http.Header{
					"Content-Type": []string{"application/json"},
				},
				Body: io.NopCloser(
					bytes.NewBufferString(`{"tag_name":"v1.2.4","html_url":"https://github.com/eryajf/kite-desktop/releases/tag/v1.2.4"}`),
				),
			}, nil
		}),
	}
	githubLatestReleaseAPI = "https://example.com/releases/latest"
	cachedUpdateResult = updateCheckResult{}
	lastUpdateFetch = time.Time{}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/version/check-update", bytes.NewBufferString(`{"force":true}`))
	c.Request.Header.Set("Content-Type", "application/json")

	CheckUpdate(c)

	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status code: %d body=%s", recorder.Code, recorder.Body.String())
	}

	var got UpdateCheckInfo
	if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if got.CurrentVersion != "1.2.3" {
		t.Fatalf("CurrentVersion = %q, want %q", got.CurrentVersion, "1.2.3")
	}
	if got.LatestVersion != "1.2.4" {
		t.Fatalf("LatestVersion = %q, want %q", got.LatestVersion, "1.2.4")
	}
	if !got.HasNew || got.Release != "https://github.com/eryajf/kite-desktop/releases/tag/v1.2.4" {
		t.Fatalf("unexpected update payload: %#v", got)
	}
	if got.CheckedAt == "" {
		t.Fatalf("CheckedAt should not be empty")
	}
}
