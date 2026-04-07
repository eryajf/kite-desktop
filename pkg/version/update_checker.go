package version

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	semver "github.com/blang/semver/v4"
	"k8s.io/klog/v2"
)

const (
	versionCheckTimeout = 3 * time.Second
	versionCacheTTL     = time.Hour
)

var githubLatestReleaseAPI = "https://api.github.com/repos/eryajf/kite-desktop/releases/latest"

var (
	updateInfoMu       sync.Mutex
	cachedUpdateResult = updateCheckResult{}
	lastUpdateFetch    time.Time
	versionCheckClient = http.DefaultClient
)

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

type updateCheckResult struct {
	hasNew        bool
	latestVersion string
	releaseURL    string
	checkedAt     time.Time
}

func checkForUpdate(ctx context.Context, currentVersion string, force bool) (updateCheckResult, error) {
	result := updateCheckResult{}

	sanitized := strings.TrimSpace(currentVersion)
	if sanitized == "" || strings.EqualFold(sanitized, "dev") {
		return result, nil
	}

	updateInfoMu.Lock()
	if !force && time.Since(lastUpdateFetch) < versionCacheTTL {
		cached := cachedUpdateResult
		updateInfoMu.Unlock()
		return cached, nil
	}
	updateInfoMu.Unlock()

	requestCtx, cancel := context.WithTimeout(ctx, versionCheckTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, githubLatestReleaseAPI, nil)
	if err != nil {
		klog.Warningf("version check request creation failed: %v", err)
		return result, fmt.Errorf("create version check request: %w", err)
	}

	req.Header.Set("User-Agent", "kite-version-checker/"+currentVersion)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := versionCheckClient.Do(req)
	if err != nil {
		klog.Warningf("version check request failed: %v", err)
		return result, fmt.Errorf("request latest release: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		klog.Warningf("version check unexpected status: %s", resp.Status)
		return result, fmt.Errorf("unexpected latest release status: %s", resp.Status)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		klog.Warningf("version check decode failed: %v", err)
		return result, fmt.Errorf("decode latest release response: %w", err)
	}

	latestVersion, err := parseSemver(release.TagName)
	if err != nil {
		klog.Warningf("latest version parse failed: %v", err)
		return result, fmt.Errorf("parse latest version: %w", err)
	}
	result.latestVersion = latestVersion.String()
	result.releaseURL = release.HTMLURL

	currentSemver, err := parseSemver(sanitized)
	if err != nil {
		klog.Warningf("current version parse failed: %v", err)
		return result, fmt.Errorf("parse current version: %w", err)
	}

	if latestVersion.GT(currentSemver) {
		result.hasNew = true
	}
	result.checkedAt = time.Now()

	cacheUpdateResult(result)
	return result, nil
}

func cacheUpdateResult(result updateCheckResult) {
	updateInfoMu.Lock()
	cachedUpdateResult = result
	lastUpdateFetch = time.Now()
	updateInfoMu.Unlock()
}

func parseSemver(version string) (semver.Version, error) {
	trimmed := strings.TrimSpace(version)
	trimmed = strings.TrimPrefix(trimmed, "v")
	if trimmed == "" {
		return semver.Version{}, errors.New("empty version")
	}

	parsed, err := semver.Parse(trimmed)
	if err != nil {
		return semver.Version{}, fmt.Errorf("invalid semver %q: %w", version, err)
	}
	return parsed, nil
}
