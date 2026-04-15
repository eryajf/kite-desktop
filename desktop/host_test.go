package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	kiteversion "github.com/eryajf/kite-desktop/pkg/version"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestLayoutAISidecarBounds(t *testing.T) {
	tests := []struct {
		name          string
		mainBounds    application.Rect
		workArea      application.Rect
		width         int
		height        int
		preferredSide string
		wantBounds    application.Rect
		wantSide      string
	}{
		{
			name:          "places on right when space is available",
			mainBounds:    application.Rect{X: 100, Y: 80, Width: 1200, Height: 900},
			workArea:      application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080},
			width:         440,
			height:        860,
			preferredSide: aiSidecarSideRight,
			wantBounds:    application.Rect{X: 1300, Y: 80, Width: 440, Height: 860},
			wantSide:      aiSidecarSideRight,
		},
		{
			name:          "falls back to left when right side does not fit",
			mainBounds:    application.Rect{X: 1500, Y: 40, Width: 380, Height: 900},
			workArea:      application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080},
			width:         440,
			height:        860,
			preferredSide: aiSidecarSideRight,
			wantBounds:    application.Rect{X: 1060, Y: 40, Width: 440, Height: 860},
			wantSide:      aiSidecarSideLeft,
		},
		{
			name:          "keeps left anchor when it still fits",
			mainBounds:    application.Rect{X: 1100, Y: 120, Width: 500, Height: 900},
			workArea:      application.Rect{X: 0, Y: 0, Width: 1920, Height: 1080},
			width:         440,
			height:        860,
			preferredSide: aiSidecarSideLeft,
			wantBounds:    application.Rect{X: 660, Y: 120, Width: 440, Height: 860},
			wantSide:      aiSidecarSideLeft,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotBounds, gotSide := layoutAISidecarBounds(
				tt.mainBounds,
				tt.workArea,
				tt.width,
				tt.height,
				aiSidecarGap,
				tt.preferredSide,
			)
			if gotBounds != tt.wantBounds {
				t.Fatalf("layoutAISidecarBounds() bounds = %#v, want %#v", gotBounds, tt.wantBounds)
			}
			if gotSide != tt.wantSide {
				t.Fatalf("layoutAISidecarBounds() side = %q, want %q", gotSide, tt.wantSide)
			}
		})
	}
}

func TestAdjustMainWindowBoundsForAISidecar(t *testing.T) {
	tests := []struct {
		name         string
		mainBounds   application.Rect
		workArea     application.Rect
		sidecarWidth int
		wantBounds   application.Rect
		wantMoved    bool
	}{
		{
			name:         "moves main window left when total width fits",
			mainBounds:   application.Rect{X: 500, Y: 80, Width: 1200, Height: 900},
			workArea:     application.Rect{X: 0, Y: 0, Width: 1800, Height: 1080},
			sidecarWidth: 440,
			wantBounds:   application.Rect{X: 160, Y: 80, Width: 1200, Height: 900},
			wantMoved:    true,
		},
		{
			name:         "does not move when right side already fits",
			mainBounds:   application.Rect{X: 100, Y: 80, Width: 1200, Height: 900},
			workArea:     application.Rect{X: 0, Y: 0, Width: 1800, Height: 1080},
			sidecarWidth: 440,
			wantBounds:   application.Rect{X: 100, Y: 80, Width: 1200, Height: 900},
			wantMoved:    false,
		},
		{
			name:         "does not move when total width cannot fit",
			mainBounds:   application.Rect{X: 100, Y: 80, Width: 1480, Height: 900},
			workArea:     application.Rect{X: 0, Y: 0, Width: 1728, Height: 1080},
			sidecarWidth: 440,
			wantBounds:   application.Rect{X: 100, Y: 80, Width: 1480, Height: 900},
			wantMoved:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotBounds, gotMoved := adjustMainWindowBoundsForAISidecar(
				tt.mainBounds,
				tt.workArea,
				tt.sidecarWidth,
				aiSidecarGap,
			)
			if gotBounds != tt.wantBounds {
				t.Fatalf("adjustMainWindowBoundsForAISidecar() bounds = %#v, want %#v", gotBounds, tt.wantBounds)
			}
			if gotMoved != tt.wantMoved {
				t.Fatalf("adjustMainWindowBoundsForAISidecar() moved = %v, want %v", gotMoved, tt.wantMoved)
			}
		})
	}
}

func TestNormalizeAndDenormalizeWindowBounds(t *testing.T) {
	screen := &application.Screen{
		ScaleFactor: 2,
	}

	original := application.Rect{
		X:      600,
		Y:      240,
		Width:  1280,
		Height: 860,
	}

	normalized := normalizeWindowBounds(original, screen)
	expectedNormalized := original
	if runtime.GOOS == "darwin" {
		expectedNormalized = application.Rect{
			X:      300,
			Y:      120,
			Width:  1280,
			Height: 860,
		}
	}
	if normalized != expectedNormalized {
		t.Fatalf("normalizeWindowBounds() = %#v, want %#v", normalized, expectedNormalized)
	}

	denormalized := denormalizeWindowBounds(normalized, screen)
	if denormalized != original {
		t.Fatalf("denormalizeWindowBounds() = %#v, want %#v", denormalized, original)
	}
}

func TestBuildApplicationMenuIncludesEditMenu(t *testing.T) {
	menu := buildApplicationMenu(nil, false)
	if menu.FindByLabel("Edit") == nil {
		t.Fatal("expected application menu to include an Edit submenu")
	}
	if menu.FindByLabel("Find in Page") == nil {
		t.Fatal("expected application menu to include Find in Page shortcut")
	}
	if menu.FindByLabel("Toggle AI Assistant") == nil {
		t.Fatal("expected application menu to include AI Assistant shortcut")
	}
	if menu.FindByRole(application.Copy) == nil {
		t.Fatal("expected application menu to include standard clipboard shortcuts")
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

func TestDesktopUpdateStateStoreClearsReadyStateAfterAppliedVersion(t *testing.T) {
	store := newDesktopUpdateStateStore(filepath.Join(t.TempDir(), "update-state.json"))
	packagePath := filepath.Join(t.TempDir(), "Kite-v0.1.5-macos-apple-silicon.zip")
	if err := os.WriteFile(packagePath, []byte("payload"), 0o644); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	if err := store.saveReadyToApply(desktopUpdateReadyState{
		Version:   "0.1.5",
		AssetName: filepath.Base(packagePath),
		Path:      packagePath,
	}); err != nil {
		t.Fatalf("saveReadyToApply() error = %v", err)
	}

	if err := store.clearReadyToApplyIfApplied("0.1.5"); err != nil {
		t.Fatalf("clearReadyToApplyIfApplied() error = %v", err)
	}

	state := store.load()
	if state.ReadyToApply != nil {
		t.Fatalf("ReadyToApply = %#v, want nil", state.ReadyToApply)
	}
}

func TestDesktopHostDownloadUpdateCreatesReadyState(t *testing.T) {
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("kite update payload"))
	}))
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	server.Listener = listener
	server.Start()
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
	err = host.updateStore.saveCheckResult(kiteversion.UpdateCheckInfo{
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

func TestNewDesktopHostClearsAppliedReadyStateOnStartup(t *testing.T) {
	origVersion := kiteversion.Version
	kiteversion.Version = "0.1.5"
	defer func() {
		kiteversion.Version = origVersion
	}()

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

	packagePath := filepath.Join(paths.TempDir, "updates", "Kite-v0.1.5-macos-apple-silicon.zip")
	if err := os.MkdirAll(filepath.Dir(packagePath), 0o755); err != nil {
		t.Fatalf("os.MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(packagePath, []byte("payload"), 0o644); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}

	store := newDesktopUpdateStateStore(paths.UpdateStatePath)
	if err := store.saveReadyToApply(desktopUpdateReadyState{
		Version:   "0.1.5",
		AssetName: filepath.Base(packagePath),
		Path:      packagePath,
	}); err != nil {
		t.Fatalf("saveReadyToApply() error = %v", err)
	}

	host := newDesktopHost(nil, "", paths)
	state := host.updateState()
	if state.ReadyToApply != nil {
		t.Fatalf("ReadyToApply = %#v, want nil", state.ReadyToApply)
	}
}
