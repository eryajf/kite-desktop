package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	kiteversion "github.com/eryajf/kite-desktop/pkg/version"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestBuildApplicationMenuIncludesEditMenu(t *testing.T) {
	menu := buildApplicationMenu(nil, false)
	if menu.FindByRole(application.EditMenu) == nil {
		t.Fatal("expected application menu to include Edit menu role for standard clipboard shortcuts")
	}
}

func TestDesktopUpdateStateStorePersistsIgnoreAndLastCheck(t *testing.T) {
	store := newDesktopUpdateStateStore(filepath.Join(t.TempDir(), "update-state.json"))

	info := kiteversion.UpdateCheckInfo{
		CurrentVersion: "0.1.1",
		LatestVersion:  "0.1.2",
		Comparison:     kiteversion.UpdateComparisonUpdateAvailable,
		HasNew:         true,
		Release:        "https://example.com/releases/v0.1.2",
	}
	if err := store.saveCheckResult(info); err != nil {
		t.Fatalf("saveCheckResult() error = %v", err)
	}
	if err := store.setIgnoredVersion("v0.1.2"); err != nil {
		t.Fatalf("setIgnoredVersion() error = %v", err)
	}

	reloaded := newDesktopUpdateStateStore(store.path)
	state := reloaded.load()
	if state.IgnoredVersion != "0.1.2" {
		t.Fatalf("IgnoredVersion = %q, want %q", state.IgnoredVersion, "0.1.2")
	}
	if state.LastCheck == nil || !state.LastCheck.Ignored {
		t.Fatalf("expected last check to be marked ignored: %#v", state.LastCheck)
	}

	if err := reloaded.clearIgnoredVersion(); err != nil {
		t.Fatalf("clearIgnoredVersion() error = %v", err)
	}
	state = reloaded.load()
	if state.IgnoredVersion != "" {
		t.Fatalf("IgnoredVersion = %q, want empty", state.IgnoredVersion)
	}
	if state.LastCheck == nil || state.LastCheck.Ignored {
		t.Fatalf("expected ignored flag cleared: %#v", state.LastCheck)
	}
}

func TestDesktopHostDownloadUpdateCreatesReadyState(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("kite update payload"))
	}))
	defer server.Close()

	baseDir := t.TempDir()
	paths := desktopPaths{
		DataDir:         baseDir,
		LogsDir:         filepath.Join(baseDir, "logs"),
		CacheDir:        filepath.Join(baseDir, "cache"),
		TempDir:         filepath.Join(baseDir, "tmp"),
		DBPath:          filepath.Join(baseDir, "kite.db"),
		WindowStatePath: filepath.Join(baseDir, "window-state.json"),
		UpdateStatePath: filepath.Join(baseDir, "update-state.json"),
	}
	if err := paths.ensure(); err != nil {
		t.Fatalf("paths.ensure() error = %v", err)
	}

	host := newDesktopHost(nil, "", paths)
	err := host.updateStore.saveCheckResult(kiteversion.UpdateCheckInfo{
		CurrentVersion: "0.1.1",
		LatestVersion:  "0.1.2",
		Comparison:     kiteversion.UpdateComparisonUpdateAvailable,
		HasNew:         true,
		AssetAvailable: true,
		Asset: &kiteversion.UpdateAsset{
			Name:        "Kite-v0.1.2-macos-arm64.dmg",
			DownloadURL: server.URL,
		},
	})
	if err != nil {
		t.Fatalf("saveCheckResult() error = %v", err)
	}

	if _, err := host.startUpdateDownload("0.1.2"); err != nil {
		t.Fatalf("startUpdateDownload() error = %v", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		state := host.updateState()
		if state.ReadyToApply != nil {
			if state.ReadyToApply.Version != "0.1.2" {
				t.Fatalf("ReadyToApply.Version = %q, want %q", state.ReadyToApply.Version, "0.1.2")
			}
			content, err := os.ReadFile(state.ReadyToApply.Path)
			if err != nil {
				t.Fatalf("os.ReadFile() error = %v", err)
			}
			if string(content) != "kite update payload" {
				t.Fatalf("unexpected downloaded content: %q", string(content))
			}
			return
		}
		if state.Download != nil && state.Download.Status == desktopUpdateDownloadStatusFailed {
			t.Fatalf("download unexpectedly failed: %#v", state.Download)
		}
		time.Sleep(50 * time.Millisecond)
	}

	t.Fatal("timed out waiting for update download to complete")
}
