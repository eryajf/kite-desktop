package main

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"

	kiteversion "github.com/eryajf/kite-desktop/pkg/version"
)

type desktopUpdateDownloadStatus string

const (
	desktopUpdateDownloadStatusDownloading desktopUpdateDownloadStatus = "downloading"
	desktopUpdateDownloadStatusFailed      desktopUpdateDownloadStatus = "download_failed"
)

type desktopUpdateDownloadState struct {
	Status           desktopUpdateDownloadStatus `json:"status"`
	Version          string                      `json:"version"`
	AssetName        string                      `json:"assetName"`
	DownloadURL      string                      `json:"downloadUrl"`
	TargetPath       string                      `json:"targetPath"`
	ReceivedBytes    int64                       `json:"receivedBytes"`
	TotalBytes       int64                       `json:"totalBytes"`
	SpeedBytesPerSec int64                       `json:"speedBytesPerSec"`
	Error            string                      `json:"error,omitempty"`
	StartedAt        string                      `json:"startedAt,omitempty"`
	UpdatedAt        string                      `json:"updatedAt,omitempty"`
}

type desktopUpdateReadyState struct {
	Version      string `json:"version"`
	AssetName    string `json:"assetName"`
	Path         string `json:"path"`
	DownloadedAt string `json:"downloadedAt,omitempty"`
}

type desktopUpdateState struct {
	IgnoredVersion string                       `json:"ignoredVersion,omitempty"`
	LastCheck      *kiteversion.UpdateCheckInfo `json:"lastCheck,omitempty"`
	Download       *desktopUpdateDownloadState  `json:"download,omitempty"`
	ReadyToApply   *desktopUpdateReadyState     `json:"readyToApply,omitempty"`
}

type desktopUpdateStateStore struct {
	path  string
	mu    sync.Mutex
	state desktopUpdateState
}

func newDesktopUpdateStateStore(path string) *desktopUpdateStateStore {
	store := &desktopUpdateStateStore{path: path}
	content, err := os.ReadFile(path)
	if err != nil {
		return store
	}
	_ = json.Unmarshal(content, &store.state)
	store.state.IgnoredVersion = normalizeStoredVersion(store.state.IgnoredVersion)
	store.state.LastCheck = applyIgnoredFlag(store.state.LastCheck, store.state.IgnoredVersion)
	store.state.Download = normalizeDownloadState(store.state.Download)
	store.state.ReadyToApply = normalizeReadyState(store.state.ReadyToApply)
	return store
}

func (s *desktopUpdateStateStore) load() desktopUpdateState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneUpdateState(s.state)
}

func (s *desktopUpdateStateStore) loadLastCheck() kiteversion.UpdateCheckInfo {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.state.LastCheck == nil {
		return kiteversion.UpdateCheckInfo{}
	}
	return *cloneUpdateCheckInfo(s.state.LastCheck)
}

func (s *desktopUpdateStateStore) saveCheckResult(info kiteversion.UpdateCheckInfo) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	info.Ignored = normalizeStoredVersion(info.LatestVersion) != "" &&
		normalizeStoredVersion(info.LatestVersion) == s.state.IgnoredVersion
	s.state.LastCheck = cloneUpdateCheckInfo(&info)
	return s.persistLocked()
}

func (s *desktopUpdateStateStore) setIgnoredVersion(version string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state.IgnoredVersion = normalizeStoredVersion(version)
	s.state.LastCheck = applyIgnoredFlag(s.state.LastCheck, s.state.IgnoredVersion)
	return s.persistLocked()
}

func (s *desktopUpdateStateStore) clearIgnoredVersion() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state.IgnoredVersion = ""
	s.state.LastCheck = applyIgnoredFlag(s.state.LastCheck, "")
	return s.persistLocked()
}

func (s *desktopUpdateStateStore) saveDownloadState(download desktopUpdateDownloadState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	download.Version = normalizeStoredVersion(download.Version)
	s.state.Download = cloneDownloadState(&download)
	return s.persistLocked()
}

func (s *desktopUpdateStateStore) clearDownloadState() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state.Download = nil
	return s.persistLocked()
}

func (s *desktopUpdateStateStore) saveReadyToApply(ready desktopUpdateReadyState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	ready.Version = normalizeStoredVersion(ready.Version)
	s.state.ReadyToApply = cloneReadyState(&ready)
	return s.persistLocked()
}

func (s *desktopUpdateStateStore) clearReadyToApply() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.state.ReadyToApply = nil
	return s.persistLocked()
}

func (s *desktopUpdateStateStore) persistLocked() error {
	payload, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, payload, 0o644)
}

func cloneUpdateState(state desktopUpdateState) desktopUpdateState {
	return desktopUpdateState{
		IgnoredVersion: state.IgnoredVersion,
		LastCheck:      cloneUpdateCheckInfo(state.LastCheck),
		Download:       cloneDownloadState(state.Download),
		ReadyToApply:   cloneReadyState(state.ReadyToApply),
	}
}

func cloneUpdateCheckInfo(info *kiteversion.UpdateCheckInfo) *kiteversion.UpdateCheckInfo {
	if info == nil {
		return nil
	}
	cloned := *info
	if info.Asset != nil {
		asset := *info.Asset
		cloned.Asset = &asset
	}
	return &cloned
}

func cloneDownloadState(state *desktopUpdateDownloadState) *desktopUpdateDownloadState {
	if state == nil {
		return nil
	}
	cloned := *state
	return &cloned
}

func cloneReadyState(state *desktopUpdateReadyState) *desktopUpdateReadyState {
	if state == nil {
		return nil
	}
	cloned := *state
	return &cloned
}

func applyIgnoredFlag(info *kiteversion.UpdateCheckInfo, ignoredVersion string) *kiteversion.UpdateCheckInfo {
	cloned := cloneUpdateCheckInfo(info)
	if cloned == nil {
		return nil
	}
	cloned.Ignored = normalizeStoredVersion(cloned.LatestVersion) != "" &&
		normalizeStoredVersion(cloned.LatestVersion) == normalizeStoredVersion(ignoredVersion)
	return cloned
}

func normalizeStoredVersion(version string) string {
	trimmed := strings.TrimSpace(version)
	trimmed = strings.TrimPrefix(trimmed, "v")
	return trimmed
}

func normalizeDownloadState(state *desktopUpdateDownloadState) *desktopUpdateDownloadState {
	if state == nil {
		return nil
	}

	cloned := cloneDownloadState(state)
	cloned.Version = normalizeStoredVersion(cloned.Version)
	if cloned.Status == desktopUpdateDownloadStatusDownloading {
		cloned.Status = desktopUpdateDownloadStatusFailed
		cloned.Error = "download interrupted"
		cloned.UpdatedAt = time.Now().Format(time.RFC3339)
	}
	return cloned
}

func normalizeReadyState(state *desktopUpdateReadyState) *desktopUpdateReadyState {
	if state == nil {
		return nil
	}

	cloned := cloneReadyState(state)
	cloned.Version = normalizeStoredVersion(cloned.Version)
	if strings.TrimSpace(cloned.Path) == "" {
		return nil
	}
	if _, err := os.Stat(cloned.Path); err != nil {
		return nil
	}
	return cloned
}
