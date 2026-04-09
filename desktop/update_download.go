package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	kiteversion "github.com/eryajf/kite-desktop/pkg/version"
)

const updateDownloadBufferSize = 128 * 1024

type desktopUpdateDownloadManager struct {
	mu     sync.Mutex
	cancel context.CancelFunc
	seq    uint64
	active uint64
}

func newDesktopUpdateDownloadManager() *desktopUpdateDownloadManager {
	return &desktopUpdateDownloadManager{}
}

func (m *desktopUpdateDownloadManager) start(cancel context.CancelFunc) (uint64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		return 0, fmt.Errorf("update download already in progress")
	}
	m.seq++
	m.active = m.seq
	m.cancel = cancel
	return m.active, nil
}

func (m *desktopUpdateDownloadManager) finish(id uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.active == id {
		m.cancel = nil
		m.active = 0
	}
}

func (m *desktopUpdateDownloadManager) cancelActive() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel == nil {
		return false
	}
	m.cancel()
	m.cancel = nil
	return true
}

func (h *desktopHost) startUpdateDownload(version string) (desktopUpdateState, error) {
	if h.updateStore == nil {
		return desktopUpdateState{}, fmt.Errorf("desktop update store unavailable")
	}

	state := h.updateStore.load()
	if state.Download != nil && state.Download.Status == desktopUpdateDownloadStatusDownloading {
		return state, nil
	}

	info, err := h.resolveDownloadableUpdate(version, state)
	if err != nil {
		return desktopUpdateState{}, err
	}

	targetPath := filepath.Join(h.paths.TempDir, "updates", info.Asset.Name)
	downloadState := desktopUpdateDownloadState{
		Status:      desktopUpdateDownloadStatusDownloading,
		Version:     info.LatestVersion,
		AssetName:   info.Asset.Name,
		DownloadURL: info.Asset.DownloadURL,
		TargetPath:  targetPath,
		TotalBytes:  info.Asset.Size,
		StartedAt:   time.Now().Format(time.RFC3339),
		UpdatedAt:   time.Now().Format(time.RFC3339),
	}
	if err := h.updateStore.saveDownloadState(downloadState); err != nil {
		return desktopUpdateState{}, err
	}
	if ready := state.ReadyToApply; ready != nil && normalizeStoredVersion(ready.Version) == normalizeStoredVersion(info.LatestVersion) {
		_ = h.updateStore.clearReadyToApply()
	}

	ctx, cancel := context.WithCancel(context.Background())
	downloadID, err := h.downloadManager.start(cancel)
	if err != nil {
		return h.updateStore.load(), err
	}

	go h.runUpdateDownload(ctx, downloadID, downloadState)
	return h.updateStore.load(), nil
}

func (h *desktopHost) retryUpdateDownload() (desktopUpdateState, error) {
	state := h.updateStore.load()
	if state.Download == nil || state.Download.Status != desktopUpdateDownloadStatusFailed {
		return state, fmt.Errorf("no failed update download to retry")
	}
	return h.startUpdateDownload(state.Download.Version)
}

func (h *desktopHost) cancelUpdateDownload() (desktopUpdateState, error) {
	if h.updateStore == nil {
		return desktopUpdateState{}, fmt.Errorf("desktop update store unavailable")
	}

	state := h.updateStore.load()
	if h.downloadManager.cancelActive() {
		if state.Download != nil {
			if state.Download.TargetPath != "" {
				_ = os.Remove(state.Download.TargetPath)
				_ = os.Remove(state.Download.TargetPath + ".part")
			}
			if err := h.updateStore.clearDownloadState(); err != nil {
				return desktopUpdateState{}, err
			}
		}
		return h.updateStore.load(), nil
	}
	if state.Download != nil {
		if state.Download.TargetPath != "" {
			_ = os.Remove(state.Download.TargetPath)
			_ = os.Remove(state.Download.TargetPath + ".part")
		}
		if err := h.updateStore.clearDownloadState(); err != nil {
			return desktopUpdateState{}, err
		}
	}
	return h.updateStore.load(), nil
}

func (h *desktopHost) resolveDownloadableUpdate(version string, state desktopUpdateState) (kiteversion.UpdateCheckInfo, error) {
	if state.LastCheck == nil {
		return kiteversion.UpdateCheckInfo{}, fmt.Errorf("run update check before downloading")
	}
	info := *state.LastCheck
	if info.Comparison != kiteversion.UpdateComparisonUpdateAvailable {
		return kiteversion.UpdateCheckInfo{}, fmt.Errorf("no update is currently available")
	}
	if info.Asset == nil || !info.AssetAvailable {
		return kiteversion.UpdateCheckInfo{}, fmt.Errorf("no downloadable update package is available for this platform")
	}
	if normalized := normalizeStoredVersion(version); normalized != "" && normalizeStoredVersion(info.LatestVersion) != normalized {
		return kiteversion.UpdateCheckInfo{}, fmt.Errorf("update version changed, please check again")
	}
	return info, nil
}

func (h *desktopHost) runUpdateDownload(ctx context.Context, downloadID uint64, state desktopUpdateDownloadState) {
	defer h.downloadManager.finish(downloadID)

	if err := os.MkdirAll(filepath.Dir(state.TargetPath), 0o755); err != nil {
		h.failUpdateDownload(state, err)
		return
	}

	tempPath := state.TargetPath + ".part"
	_ = os.Remove(tempPath)

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, state.DownloadURL, nil)
	if err != nil {
		h.failUpdateDownload(state, err)
		return
	}
	request.Header.Set("User-Agent", "kite-desktop-updater/"+kiteversion.Version)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			h.cleanupCanceledDownload(tempPath)
			return
		}
		h.failUpdateDownload(state, err)
		return
	}
	defer func() {
		_ = response.Body.Close()
	}()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		h.failUpdateDownload(state, fmt.Errorf("download failed with status %d", response.StatusCode))
		return
	}

	if response.ContentLength > 0 {
		state.TotalBytes = response.ContentLength
	}

	file, err := os.Create(tempPath)
	if err != nil {
		h.failUpdateDownload(state, err)
		return
	}

	buffer := make([]byte, updateDownloadBufferSize)
	startedAt := time.Now()
	lastSampleTime := startedAt
	lastSampleBytes := int64(0)

	for {
		n, readErr := response.Body.Read(buffer)
		if n > 0 {
			if _, err := file.Write(buffer[:n]); err != nil {
				_ = file.Close()
				h.failUpdateDownload(state, err)
				return
			}
			state.ReceivedBytes += int64(n)

			now := time.Now()
			if now.Sub(lastSampleTime) >= 300*time.Millisecond {
				elapsed := now.Sub(lastSampleTime)
				if elapsed > 0 {
					state.SpeedBytesPerSec = int64(float64(state.ReceivedBytes-lastSampleBytes) / elapsed.Seconds())
				}
				state.UpdatedAt = now.Format(time.RFC3339)
				_ = h.updateStore.saveDownloadState(state)
				lastSampleTime = now
				lastSampleBytes = state.ReceivedBytes
			}
		}

		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			_ = file.Close()
			if ctx.Err() != nil {
				h.cleanupCanceledDownload(tempPath)
				return
			}
			h.failUpdateDownload(state, readErr)
			return
		}
	}

	if err := file.Close(); err != nil {
		h.failUpdateDownload(state, err)
		return
	}

	if ctx.Err() != nil {
		h.cleanupCanceledDownload(tempPath)
		return
	}

	if err := os.Rename(tempPath, state.TargetPath); err != nil {
		h.failUpdateDownload(state, err)
		return
	}

	_ = h.updateStore.clearDownloadState()
	_ = h.updateStore.saveReadyToApply(desktopUpdateReadyState{
		Version:      state.Version,
		AssetName:    state.AssetName,
		Path:         state.TargetPath,
		DownloadedAt: startedAt.Format(time.RFC3339),
	})
}

func (h *desktopHost) failUpdateDownload(state desktopUpdateDownloadState, err error) {
	state.Status = desktopUpdateDownloadStatusFailed
	state.Error = err.Error()
	state.SpeedBytesPerSec = 0
	state.UpdatedAt = time.Now().Format(time.RFC3339)
	_ = os.Remove(state.TargetPath + ".part")
	_ = h.updateStore.saveDownloadState(state)
}

func (h *desktopHost) cleanupCanceledDownload(tempPath string) {
	_ = os.Remove(tempPath)
	_ = h.updateStore.clearDownloadState()
}
