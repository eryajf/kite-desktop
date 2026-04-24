package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/eryajf/kite-desktop/pkg/common"
	kiteversion "github.com/eryajf/kite-desktop/pkg/version"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"
)

//go:embed build/appicon.png
var desktopTrayIcon []byte

//go:embed build/appicon-macos.png
var desktopMacAppIcon []byte

const (
	aiChatToggleEvent     = "kite:ai-chat-toggle"
	pageFindOpenEvent     = "kite:page-find-open"
	pageFindNextEvent     = "kite:page-find-next"
	pageFindPreviousEvent = "kite:page-find-previous"
	navigateBackEvent     = "kite:navigate-back"
	navigateForwardEvent  = "kite:navigate-forward"
	windowNameChangeEvent = "kite:window-name-change"
	mainWindowName        = "main"
	aiSidecarWindowName   = "ai-sidecar"
	aiSidecarWindowTitle  = "Kite AI Chat"
	aiSidecarGap          = 0
	aiSidecarSideRight    = "right"
	aiSidecarSideLeft     = "left"
	settingsGeneralRoute  = "/settings?tab=general"
	settingsDesktopRoute  = "/settings?tab=desktop"
	settingsAboutRoute    = "/settings?tab=about"
)

func desktopApplicationIcon() []byte {
	if runtime.GOOS == "darwin" && len(desktopMacAppIcon) > 0 {
		return desktopMacAppIcon
	}
	return desktopTrayIcon
}

type desktopPaths struct {
	DataDir         string
	LogsDir         string
	CacheDir        string
	TempDir         string
	DBPath          string
	WindowStatePath string
	UpdateStatePath string
}

type desktopWindowState struct {
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	Maximised bool `json:"maximised"`
}

type desktopWindowStateStore struct {
	path  string
	mu    sync.Mutex
	state desktopWindowState
	valid bool
}

type desktopHost struct {
	app             *application.App
	baseURL         string
	paths           desktopPaths
	stateStore      *desktopWindowStateStore
	updateStore     *desktopUpdateStateStore
	downloadManager *desktopUpdateDownloadManager
	updateClient    *http.Client

	mainWindow  *application.WebviewWindow
	aiSidecar   *application.WebviewWindow
	aiSide      string
	systemTray  *application.SystemTray
	backItem    *application.MenuItem
	forwardItem *application.MenuItem

	aiSidecarClosing atomic.Bool
	quitting         atomic.Bool
}

func resolveDesktopPaths() (desktopPaths, error) {
	baseDir, err := os.UserConfigDir()
	if err != nil {
		return desktopPaths{}, err
	}

	dataDir := filepath.Join(baseDir, "Kite")
	return desktopPaths{
		DataDir:         dataDir,
		LogsDir:         filepath.Join(dataDir, "logs"),
		CacheDir:        filepath.Join(dataDir, "cache"),
		TempDir:         filepath.Join(dataDir, "tmp"),
		DBPath:          filepath.Join(dataDir, "kite.db"),
		WindowStatePath: filepath.Join(dataDir, "window-state.json"),
		UpdateStatePath: filepath.Join(dataDir, "update-state.json"),
	}, nil
}

func (p desktopPaths) ensure() error {
	for _, dir := range []string{p.DataDir, p.LogsDir, p.CacheDir, p.TempDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	return nil
}

func newDesktopWindowStateStore(path string) *desktopWindowStateStore {
	store := &desktopWindowStateStore{path: path}
	content, err := os.ReadFile(path)
	if err != nil {
		return store
	}
	var state desktopWindowState
	if err := json.Unmarshal(content, &state); err != nil {
		return store
	}
	if state.Width > 0 && state.Height > 0 {
		store.state = state
		store.valid = true
	}
	return store
}

func (s *desktopWindowStateStore) load() (desktopWindowState, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state, s.valid
}

func (s *desktopWindowStateStore) save(state desktopWindowState) error {
	if state.Width <= 0 || state.Height <= 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.path, payload, 0o644); err != nil {
		return err
	}
	s.state = state
	s.valid = true
	return nil
}

func newDesktopHost(app *application.App, baseURL string, paths desktopPaths) *desktopHost {
	updateStore := newDesktopUpdateStateStore(paths.UpdateStatePath)
	_ = updateStore.clearReadyToApplyIfApplied(kiteversion.Version)

	return &desktopHost{
		app:             app,
		baseURL:         baseURL,
		paths:           paths,
		stateStore:      newDesktopWindowStateStore(paths.WindowStatePath),
		updateStore:     updateStore,
		downloadManager: newDesktopUpdateDownloadManager(),
		updateClient:    http.DefaultClient,
	}
}

func desktopSingleInstanceOptions(onSecondLaunch func()) *application.SingleInstanceOptions {
	encryptionKey := sha256.Sum256([]byte("io.kite.desktop"))

	return &application.SingleInstanceOptions{
		UniqueID:      "io.kite.desktop",
		EncryptionKey: encryptionKey,
		OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
			if onSecondLaunch != nil {
				onSecondLaunch()
			}
		},
		AdditionalData: map[string]string{
			"runtime": common.RuntimeDesktopLocal,
		},
	}
}

func (h *desktopHost) capabilities() desktopCapabilities {
	return desktopCapabilities{
		NativeFileDialog: true,
		NativeSaveDialog: true,
		Tray:             true,
		Menu:             true,
		SingleInstance:   true,
	}
}

func (h *desktopHost) mainWindowOptions() application.WebviewWindowOptions {
	opts := desktopWindowOptions(application.WebviewWindowOptions{
		Name:           mainWindowName,
		Title:          "Kite",
		Width:          1480,
		Height:         960,
		MinWidth:       1100,
		MinHeight:      760,
		EnableFileDrop: true,
		URL:            serverStartURL(h.baseURL),
	})

	if state, ok := h.stateStore.load(); ok {
		opts.Width = state.Width
		opts.Height = state.Height
		opts.X = state.X
		opts.Y = state.Y
		if state.Maximised {
			opts.StartState = application.WindowStateMaximised
		}
	}

	return opts
}

func (h *desktopHost) registerMainWindow(window *application.WebviewWindow) {
	h.mainWindow = window
	h.bindWindowName(window, mainWindowName)
	window.RegisterKeyBinding("CmdOrCtrl+W", func(_ application.Window) {
		if h.quitting.Load() {
			return
		}
		window.Close()
	})

	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		h.closeAISidecar()
		if h.quitting.Load() || desktopDevMode() {
			return
		}
		window.Hide()
		event.Cancel()
	})

	saveIfNormal := func() {
		if window.IsMaximised() || window.IsMinimised() {
			return
		}
		h.saveMainWindowState(false)
	}

	window.RegisterHook(events.Common.WindowDidMove, func(event *application.WindowEvent) {
		saveIfNormal()
		h.syncAISidecarPosition()
	})
	window.RegisterHook(events.Common.WindowDidResize, func(event *application.WindowEvent) {
		saveIfNormal()
		h.syncAISidecarPosition()
	})
	window.RegisterHook(events.Common.WindowFocus, func(event *application.WindowEvent) {
		h.raiseAISidecar()
	})
	window.RegisterHook(events.Common.WindowShow, func(event *application.WindowEvent) {
		h.raiseAISidecar()
	})
	window.RegisterHook(events.Common.WindowMaximise, func(event *application.WindowEvent) {
		h.saveMainWindowState(true)
		h.syncAISidecarPosition()
	})
	window.RegisterHook(events.Common.WindowUnMaximise, func(event *application.WindowEvent) {
		h.saveMainWindowState(false)
		h.syncAISidecarPosition()
	})

	if runtime.GOOS == "darwin" {
		h.app.Event.OnApplicationEvent(events.Mac.ApplicationDidBecomeActive, func(event *application.ApplicationEvent) {
			h.raiseAISidecar()
		})
		h.app.Event.OnApplicationEvent(events.Mac.ApplicationDidResignActive, func(event *application.ApplicationEvent) {
			h.setAISidecarAlwaysOnTop(false)
		})
		h.app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(event *application.ApplicationEvent) {
			h.focusMainWindow()
		})
	}
}

func (h *desktopHost) saveMainWindowState(maximised bool) {
	if h.mainWindow == nil {
		return
	}
	bounds := h.mainWindow.Bounds()
	if bounds.Width <= 0 || bounds.Height <= 0 {
		return
	}
	_ = h.stateStore.save(desktopWindowState{
		X:         bounds.X,
		Y:         bounds.Y,
		Width:     bounds.Width,
		Height:    bounds.Height,
		Maximised: maximised,
	})
}

func (h *desktopHost) emitWindowEvent(eventName string) {
	if h == nil || h.mainWindow == nil {
		return
	}
	h.mainWindow.ExecJS(
		fmt.Sprintf("window.dispatchEvent(new Event(%s))", strconv.Quote(eventName)),
	)
}

func (h *desktopHost) emitPageFindEvent(eventName string) {
	h.emitWindowEvent(eventName)
}

func (h *desktopHost) emitNavigationEvent(eventName string) {
	h.emitWindowEvent(eventName)
}

func (h *desktopHost) persistStateOnShutdown() {
	if h.mainWindow == nil {
		return
	}
	h.saveMainWindowState(h.mainWindow.IsMaximised())
}

func (h *desktopHost) focusMainWindow() {
	if h.mainWindow == nil {
		return
	}
	h.mainWindow.Restore()
	h.mainWindow.Show()
	h.mainWindow.Focus()
}

func (h *desktopHost) hideMainWindow() {
	if h.mainWindow == nil {
		return
	}
	h.closeAISidecar()
	h.mainWindow.Hide()
}

func (h *desktopHost) setWindowName(window *application.WebviewWindow, name string) {
	if window == nil {
		return
	}
	window.ExecJS(
		fmt.Sprintf(
			"(function(){window.__KITE_WINDOW_NAME__=%[1]s;window.dispatchEvent(new CustomEvent(%[2]s,{detail:{windowName:%[1]s}}));})();",
			strconv.Quote(name),
			strconv.Quote(windowNameChangeEvent),
		),
	)
}

func (h *desktopHost) bindWindowName(window *application.WebviewWindow, name string) {
	if window == nil {
		return
	}

	h.setWindowName(window, name)

	window.RegisterHook(events.Common.WindowShow, func(event *application.WindowEvent) {
		h.setWindowName(window, name)
	})
	window.RegisterHook(events.Common.WindowFocus, func(event *application.WindowEvent) {
		h.setWindowName(window, name)
	})

	switch runtime.GOOS {
	case "darwin":
		window.RegisterHook(events.Mac.WebViewDidFinishNavigation, func(event *application.WindowEvent) {
			h.setWindowName(window, name)
		})
	case "windows":
		window.RegisterHook(events.Windows.WebViewNavigationCompleted, func(event *application.WindowEvent) {
			h.setWindowName(window, name)
		})
	default:
		window.RegisterHook(events.Linux.WindowLoadFinished, func(event *application.WindowEvent) {
			h.setWindowName(window, name)
		})
	}
}

func (h *desktopHost) setNavigationMenuItems(backItem, forwardItem *application.MenuItem) {
	h.backItem = backItem
	h.forwardItem = forwardItem
}

func (h *desktopHost) setNavigationMenuState(canGoBack, canGoForward bool) {
	if h == nil {
		return
	}
	if h.backItem != nil {
		h.backItem.SetEnabled(canGoBack)
	}
	if h.forwardItem != nil {
		h.forwardItem.SetEnabled(canGoForward)
	}
}

func layoutAISidecarBounds(
	mainBounds application.Rect,
	workArea application.Rect,
	width, height, gap int,
	preferredSide string,
) (application.Rect, string) {
	bounds := application.Rect{
		X:      mainBounds.X + mainBounds.Width + gap,
		Y:      mainBounds.Y,
		Width:  width,
		Height: height,
	}

	if workArea.Width <= 0 || workArea.Height <= 0 {
		if preferredSide == aiSidecarSideLeft {
			bounds.X = mainBounds.X - gap - bounds.Width
			return bounds, aiSidecarSideLeft
		}
		return bounds, aiSidecarSideRight
	}

	if bounds.Width > workArea.Width {
		bounds.Width = workArea.Width
	}
	if bounds.Height > workArea.Height {
		bounds.Height = workArea.Height
	}

	rightX := mainBounds.X + mainBounds.Width + gap
	leftX := mainBounds.X - gap - bounds.Width
	workAreaRight := workArea.X + workArea.Width
	workAreaBottom := workArea.Y + workArea.Height
	canPlaceRight := rightX+bounds.Width <= workAreaRight
	canPlaceLeft := leftX >= workArea.X

	sideOrder := []string{aiSidecarSideRight, aiSidecarSideLeft}
	if preferredSide == aiSidecarSideLeft {
		sideOrder = []string{aiSidecarSideLeft, aiSidecarSideRight}
	}

	actualSide := aiSidecarSideRight
	positioned := false
	for _, side := range sideOrder {
		switch {
		case side == aiSidecarSideRight && canPlaceRight:
			bounds.X = rightX
			actualSide = aiSidecarSideRight
			positioned = true
		case side == aiSidecarSideLeft && canPlaceLeft:
			bounds.X = leftX
			actualSide = aiSidecarSideLeft
			positioned = true
		}
		if positioned {
			break
		}
	}

	if !positioned {
		actualSide = aiSidecarSideRight
		maxX := workAreaRight - bounds.Width
		if maxX < workArea.X {
			maxX = workArea.X
		}
		switch {
		case rightX < workArea.X:
			bounds.X = workArea.X
		case rightX > maxX:
			bounds.X = maxX
		default:
			bounds.X = rightX
		}
	}
	maxY := workAreaBottom - bounds.Height
	if maxY < workArea.Y {
		maxY = workArea.Y
	}
	if bounds.Y < workArea.Y {
		bounds.Y = workArea.Y
	} else if bounds.Y > maxY {
		bounds.Y = maxY
	}

	return bounds, actualSide
}

func adjustMainWindowBoundsForAISidecar(
	mainBounds application.Rect,
	workArea application.Rect,
	sidecarWidth, gap int,
) (application.Rect, bool) {
	if workArea.Width <= 0 || sidecarWidth <= 0 {
		return mainBounds, false
	}

	requiredWidth := mainBounds.Width + gap + sidecarWidth
	if requiredWidth > workArea.Width {
		return mainBounds, false
	}

	workAreaRight := workArea.X + workArea.Width
	maxMainX := workAreaRight - requiredWidth
	if maxMainX < workArea.X {
		maxMainX = workArea.X
	}
	if mainBounds.X <= maxMainX {
		return mainBounds, false
	}

	mainBounds.X = maxMainX
	return mainBounds, true
}

func windowPositionScaleFactor(screen *application.Screen) float64 {
	if runtime.GOOS != "darwin" || screen == nil || screen.ScaleFactor <= 0 {
		return 1
	}
	return float64(screen.ScaleFactor)
}

func normalizeWindowBounds(bounds application.Rect, screen *application.Screen) application.Rect {
	scale := windowPositionScaleFactor(screen)
	if scale == 1 {
		return bounds
	}

	bounds.X = int(math.Round(float64(bounds.X) / scale))
	bounds.Y = int(math.Round(float64(bounds.Y) / scale))
	return bounds
}

func denormalizeWindowBounds(bounds application.Rect, screen *application.Screen) application.Rect {
	scale := windowPositionScaleFactor(screen)
	if scale == 1 {
		return bounds
	}

	bounds.X = int(math.Round(float64(bounds.X) * scale))
	bounds.Y = int(math.Round(float64(bounds.Y) * scale))
	return bounds
}

func (h *desktopHost) buildAISidecarBounds(width, height int, preferredSide string) (application.Rect, string) {
	bounds := application.Rect{
		X:      0,
		Y:      0,
		Width:  width,
		Height: height,
	}
	if h == nil || h.mainWindow == nil {
		return bounds, aiSidecarSideRight
	}

	mainBounds := h.mainWindow.Bounds()
	screen, err := h.mainWindow.GetScreen()
	if err != nil || screen == nil {
		return layoutAISidecarBounds(
			mainBounds,
			application.Rect{},
			width,
			height,
			aiSidecarGap,
			preferredSide,
		)
	}

	mainBounds = normalizeWindowBounds(mainBounds, screen)

	return layoutAISidecarBounds(
		mainBounds,
		screen.WorkArea,
		width,
		height,
		aiSidecarGap,
		preferredSide,
	)
}

func (h *desktopHost) syncAISidecarPosition() {
	if h == nil || h.aiSidecarClosing.Load() {
		return
	}
	sidecar, ok := h.getAISidecar()
	if !ok || h.mainWindow == nil {
		return
	}

	mainBounds := h.mainWindow.Bounds()
	sidecarBounds := sidecar.Bounds()
	bounds, side := h.buildAISidecarBounds(
		sidecarBounds.Width,
		mainBounds.Height,
		h.aiSide,
	)
	h.aiSide = side
	if screen, err := h.mainWindow.GetScreen(); err == nil && screen != nil {
		sidecar.SetBounds(denormalizeWindowBounds(bounds, screen))
		return
	}
	sidecar.SetBounds(bounds)
}

func (h *desktopHost) setAISidecarAlwaysOnTop(alwaysOnTop bool) {
	if h == nil || h.aiSidecarClosing.Load() {
		return
	}
	sidecar, ok := h.getAISidecar()
	if !ok {
		return
	}
	sidecar.SetAlwaysOnTop(alwaysOnTop)
}

func (h *desktopHost) raiseAISidecar() {
	if h == nil || h.aiSidecarClosing.Load() {
		return
	}
	sidecar, ok := h.getAISidecar()
	if !ok {
		return
	}
	sidecar.SetAlwaysOnTop(false)
	sidecar.SetAlwaysOnTop(true)
}

func (h *desktopHost) getAISidecar() (*application.WebviewWindow, bool) {
	if h == nil || h.app == nil || h.aiSidecarClosing.Load() {
		return nil, false
	}
	window, ok := h.app.Window.GetByName(aiSidecarWindowName)
	if !ok {
		return nil, false
	}
	sidecar, ok := window.(*application.WebviewWindow)
	if !ok {
		return nil, false
	}
	h.aiSidecar = sidecar
	h.setWindowName(sidecar, aiSidecarWindowName)
	return sidecar, true
}

func (h *desktopHost) registerAISidecarWindow(sidecar *application.WebviewWindow) {
	if sidecar == nil {
		return
	}
	h.bindWindowName(sidecar, aiSidecarWindowName)

	sidecar.RegisterHook(events.Common.WindowFocus, func(event *application.WindowEvent) {
		h.raiseAISidecar()
	})
	sidecar.RegisterHook(events.Common.WindowShow, func(event *application.WindowEvent) {
		h.raiseAISidecar()
	})
	sidecar.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		h.aiSidecarClosing.Store(true)
		h.aiSidecar = nil
		h.aiSide = ""
	})
}

func (h *desktopHost) openAISidecar(targetURL string, width, height, minWidth, minHeight int) {
	if h == nil || h.app == nil {
		return
	}
	h.aiSidecarClosing.Store(false)

	if width <= 0 {
		width = 440
	}
	if minWidth <= 0 {
		minWidth = 360
	}
	if width < minWidth {
		width = minWidth
	}
	if minHeight <= 0 {
		minHeight = 640
	}

	if h.mainWindow != nil {
		mainBounds := h.mainWindow.Bounds()
		if mainBounds.Height > 0 {
			height = mainBounds.Height
		}
	}
	if height <= 0 {
		height = 860
	}
	if height < minHeight {
		height = minHeight
	}

	if h.mainWindow != nil {
		if screen, err := h.mainWindow.GetScreen(); err == nil && screen != nil {
			mainBounds := normalizeWindowBounds(h.mainWindow.Bounds(), screen)
			if adjustedBounds, moved := adjustMainWindowBoundsForAISidecar(
				mainBounds,
				screen.WorkArea,
				width,
				aiSidecarGap,
			); moved {
				adjustedBounds = denormalizeWindowBounds(adjustedBounds, screen)
				h.mainWindow.SetPosition(adjustedBounds.X, adjustedBounds.Y)
			}
		}
	}

	bounds, side := h.buildAISidecarBounds(width, height, aiSidecarSideRight)
	h.aiSide = side

	if sidecar, ok := h.getAISidecar(); ok {
		sidecar.SetTitle(aiSidecarWindowTitle)
		sidecar.SetMinSize(minWidth, minHeight)
		if screen, err := h.mainWindow.GetScreen(); err == nil && screen != nil {
			sidecar.SetBounds(denormalizeWindowBounds(bounds, screen))
		} else {
			sidecar.SetBounds(bounds)
		}
		sidecar.Restore()
		sidecar.Show()
		sidecar.Focus()
		h.raiseAISidecar()
		return
	}

	initialBounds := bounds
	if screen, err := h.mainWindow.GetScreen(); err == nil && screen != nil {
		initialBounds = denormalizeWindowBounds(bounds, screen)
	}

	sidecar := h.app.Window.NewWithOptions(desktopWindowOptions(application.WebviewWindowOptions{
		Name:            aiSidecarWindowName,
		Title:           aiSidecarWindowTitle,
		URL:             targetURL,
		Width:           initialBounds.Width,
		Height:          initialBounds.Height,
		InitialPosition: application.WindowXY,
		X:               initialBounds.X,
		Y:               initialBounds.Y,
		MinWidth:        minWidth,
		MinHeight:       minHeight,
	}))
	sidecar.SetBounds(initialBounds)
	h.registerAISidecarWindow(sidecar)
	h.aiSidecar = sidecar
	h.syncAISidecarPosition()
	h.raiseAISidecar()
}

func (h *desktopHost) toggleAISidecar(targetURL string, width, height, minWidth, minHeight int) {
	if _, ok := h.getAISidecar(); ok {
		h.closeAISidecar()
		return
	}
	h.openAISidecar(targetURL, width, height, minWidth, minHeight)
}

func (h *desktopHost) closeAISidecar() {
	if h == nil {
		return
	}
	if h.aiSidecarClosing.Load() {
		h.aiSidecar = nil
		h.aiSide = ""
		return
	}
	sidecar, ok := h.getAISidecar()
	if !ok {
		h.aiSidecar = nil
		h.aiSide = ""
		return
	}
	h.aiSidecarClosing.Store(true)
	h.aiSidecar = nil
	h.aiSide = ""
	sidecar.Close()
}

func (h *desktopHost) quit() {
	h.quitting.Store(true)
	h.closeAISidecar()
	h.persistStateOnShutdown()
	h.app.Quit()
}

func (h *desktopHost) reloadMainWindow() {
	if h.mainWindow == nil {
		return
	}
	h.mainWindow.Reload()
}

func (h *desktopHost) navigate(route string) {
	if h.mainWindow == nil {
		return
	}
	h.focusMainWindow()
	h.mainWindow.SetURL(appURL(h.baseURL, route))
}

func (h *desktopHost) openExternalURL(rawURL string) error {
	return h.app.Browser.OpenURL(rawURL)
}

func (h *desktopHost) openPath(path string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("path is required")
	}
	return h.app.Browser.OpenFile(path)
}

func (h *desktopHost) revealPath(path string) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("path is required")
	}
	target := path
	info, err := os.Stat(path)
	if err == nil && !info.IsDir() {
		target = filepath.Dir(path)
	}
	return h.openPath(target)
}

func (h *desktopHost) openConfigDir() error {
	return h.openPath(h.paths.DataDir)
}

func (h *desktopHost) openLogsDir() error {
	return h.openPath(h.paths.LogsDir)
}

func (h *desktopHost) copyToClipboard(text string) error {
	if !h.app.Clipboard.SetText(text) {
		return fmt.Errorf("failed to copy text to clipboard")
	}
	return nil
}

func (h *desktopHost) appInfo() desktopAppInfoResponse {
	return desktopAppInfoResponse{
		Name:      "Kite",
		Runtime:   common.AppRuntime,
		Version:   kiteversion.Version,
		BuildDate: kiteversion.BuildDate,
		CommitID:  kiteversion.CommitID,
		Paths: desktopAppPaths{
			ConfigDir: h.paths.DataDir,
			LogsDir:   h.paths.LogsDir,
			CacheDir:  h.paths.CacheDir,
			TempDir:   h.paths.TempDir,
		},
	}
}

func (h *desktopHost) updateState() desktopUpdateState {
	if h.updateStore == nil {
		return desktopUpdateState{}
	}
	return h.updateStore.load()
}

func (h *desktopHost) checkForUpdate(ctx context.Context, force bool) (kiteversion.UpdateCheckInfo, error) {
	info, err := kiteversion.GetUpdateCheckInfo(ctx, kiteversion.Version, force, common.UpdateSource)
	if err != nil {
		return kiteversion.UpdateCheckInfo{}, err
	}
	if h.updateStore == nil {
		return info, nil
	}
	if err := h.updateStore.saveCheckResult(info); err != nil {
		return kiteversion.UpdateCheckInfo{}, err
	}
	return h.updateStore.loadLastCheck(), nil
}

func (h *desktopHost) ignoreUpdateVersion(version string) error {
	if h.updateStore == nil {
		return fmt.Errorf("desktop update store unavailable")
	}
	return h.updateStore.setIgnoredVersion(version)
}

func (h *desktopHost) clearIgnoredUpdateVersion() error {
	if h.updateStore == nil {
		return fmt.Errorf("desktop update store unavailable")
	}
	return h.updateStore.clearIgnoredVersion()
}

func (h *desktopHost) importKubeconfigFromDialog() error {
	dialog := h.app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false)
	if defaultDir := defaultKubeconfigDir(); defaultDir != "" {
		dialog.SetDirectory(defaultDir)
	}
	dialog.SetTitle("Import kubeconfig")
	dialog.SetMessage("Select a kubeconfig file to import into Kite")
	dialog.SetButtonText("Import")
	dialog.AddFilter("Kubeconfig", "*.yaml;*.yml;*.config")
	if h.mainWindow != nil {
		dialog.AttachToWindow(h.mainWindow)
	}

	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		return err
	}
	if path == "" {
		return nil
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	if err := h.importKubeconfigContent(string(content)); err != nil {
		return err
	}
	return nil
}

func (h *desktopHost) importKubeconfigContent(content string) error {
	payload, err := json.Marshal(common.ImportClustersRequest{
		Config:    content,
		InCluster: false,
	})
	if err != nil {
		return err
	}

	endpoint := h.baseURL + apiPath("/api/v1/admin/clusters/import")
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		if len(body) == 0 {
			return fmt.Errorf("import kubeconfig failed with status %d", resp.StatusCode)
		}
		var errResp struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(body, &errResp) == nil && strings.TrimSpace(errResp.Error) != "" {
			return fmt.Errorf("%s", errResp.Error)
		}
		return fmt.Errorf("%s", strings.TrimSpace(string(body)))
	}

	return nil
}

func (h *desktopHost) showErrorDialog(title, message string) {
	dialog := h.app.Dialog.Error().SetTitle(title).SetMessage(message)
	if h.mainWindow != nil {
		dialog.AttachToWindow(h.mainWindow)
	}
	dialog.Show()
}

func buildApplicationMenu(h *desktopHost, devMode bool) *application.Menu {
	menu := application.NewMenu()
	appMenu := menu.AddSubmenu("Kite")
	appMenu.Add("About Kite").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.navigate(settingsAboutRoute)
	})
	appMenu.Add("Preferences").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.navigate(settingsGeneralRoute)
	}).SetAccelerator("CmdOrCtrl+,")
	appMenu.AddSeparator()
	appMenu.Add("Quit").SetAccelerator("CmdOrCtrl+q").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.quit()
	})

	fileMenu := menu.AddSubmenu("File")
	fileMenu.Add("Import kubeconfig").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		if err := h.importKubeconfigFromDialog(); err != nil {
			h.showErrorDialog("Import kubeconfig failed", err.Error())
			return
		}
		h.reloadMainWindow()
	})
	fileMenu.Add("Open Config Directory").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		if err := h.openConfigDir(); err != nil {
			h.showErrorDialog("Open config directory failed", err.Error())
		}
	})
	fileMenu.Add("Open Logs Directory").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		if err := h.openLogsDir(); err != nil {
			h.showErrorDialog("Open logs directory failed", err.Error())
		}
	})

	editMenu := menu.AddSubmenu("Edit")
	editMenu.AddRole(application.Undo)
	editMenu.AddRole(application.Redo)
	backItem := editMenu.Add("Back").SetEnabled(false).OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.emitNavigationEvent(navigateBackEvent)
	})
	forwardItem := editMenu.Add("Forward").SetEnabled(false).OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.emitNavigationEvent(navigateForwardEvent)
	})
	if h != nil {
		h.setNavigationMenuItems(backItem, forwardItem)
	}
	editMenu.AddSeparator()
	editMenu.AddRole(application.Cut)
	editMenu.AddRole(application.Copy)
	if runtime.GOOS != "windows" {
		editMenu.AddRole(application.Paste)
	}
	if runtime.GOOS == "darwin" {
		editMenu.AddRole(application.PasteAndMatchStyle)
		editMenu.AddRole(application.Delete)
		editMenu.AddRole(application.SelectAll)
		editMenu.AddSeparator()
		editMenu.AddRole(application.SpeechMenu)
	} else {
		editMenu.AddRole(application.Delete)
		editMenu.AddSeparator()
		editMenu.AddRole(application.SelectAll)
	}
	editMenu.AddSeparator()
	editMenu.Add("Find in Page").SetAccelerator("CmdOrCtrl+f").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.emitPageFindEvent(pageFindOpenEvent)
	})
	editMenu.Add("Find Next").SetAccelerator("CmdOrCtrl+g").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.emitPageFindEvent(pageFindNextEvent)
	})
	editMenu.Add("Find Previous").SetAccelerator("CmdOrCtrl+Shift+g").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.emitPageFindEvent(pageFindPreviousEvent)
	})
	editMenu.AddSeparator()
	editMenu.Add("Toggle AI Assistant").SetAccelerator("CmdOrCtrl+Shift+a").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.emitWindowEvent(aiChatToggleEvent)
	})

	viewMenu := menu.AddSubmenu("View")
	viewMenu.AddRole(application.Reload)
	viewMenu.AddRole(application.ResetZoom)
	viewMenu.AddRole(application.ZoomIn)
	viewMenu.AddRole(application.ZoomOut)
	viewMenu.AddRole(application.ToggleFullscreen)
	if devMode {
		viewMenu.AddSeparator()
		viewMenu.AddRole(application.OpenDevTools)
	}

	windowMenu := menu.AddSubmenu("Window")
	windowMenu.AddRole(application.Minimise)
	windowMenu.AddRole(application.Zoom)
	if runtime.GOOS == "darwin" {
		windowMenu.Add("Close Window").SetAccelerator("CmdOrCtrl+W").OnClick(func(ctx *application.Context) {
			if h == nil {
				return
			}
			h.hideMainWindow()
		})
	} else {
		windowMenu.AddRole(application.CloseWindow)
	}

	helpMenu := menu.AddSubmenu("Help")
	helpMenu.Add("Documentation").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		_ = h.openExternalURL("https://github.com/eryajf/kite-desktop#readme")
	})
	helpMenu.Add("GitHub").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		_ = h.openExternalURL("https://github.com/eryajf/kite-desktop")
	})
	helpMenu.Add("Report Issue").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		_ = h.openExternalURL("https://github.com/eryajf/kite-desktop/issues/new")
	})

	return menu
}

func (h *desktopHost) setupApplicationMenu() {
	menu := buildApplicationMenu(h, desktopDevMode())
	h.app.Menu.SetApplicationMenu(menu)
}

func buildTrayMenu(h *desktopHost) *application.Menu {
	menu := application.NewMenu()
	menu.Add("Show Kite").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.focusMainWindow()
	})
	menu.Add("Settings").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.navigate(settingsGeneralRoute)
	})
	menu.Add("Desktop Settings").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.navigate(settingsDesktopRoute)
	})
	menu.Add("About Kite").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.navigate(settingsAboutRoute)
	})
	menu.Add("Import kubeconfig").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		if err := h.importKubeconfigFromDialog(); err != nil {
			h.showErrorDialog("Import kubeconfig failed", err.Error())
			return
		}
		h.reloadMainWindow()
	})
	menu.Add("Open Config Directory").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		if err := h.openConfigDir(); err != nil {
			h.showErrorDialog("Open config directory failed", err.Error())
		}
	})
	menu.Add("Open Logs Directory").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		if err := h.openLogsDir(); err != nil {
			h.showErrorDialog("Open logs directory failed", err.Error())
		}
	})
	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(ctx *application.Context) {
		if h == nil {
			return
		}
		h.quit()
	})
	return menu
}

func (h *desktopHost) setupSystemTray() {
	tray := h.app.SystemTray.New()
	tray.SetTooltip("Kite")

	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(icons.SystrayMacTemplate)
	} else if len(desktopTrayIcon) > 0 {
		tray.SetIcon(desktopTrayIcon)
	}

	tray.SetMenu(buildTrayMenu(h))
	tray.OnClick(func() {
		h.focusMainWindow()
	})
	h.systemTray = tray
}

func desktopWindowOptions(opts application.WebviewWindowOptions) application.WebviewWindowOptions {
	opts.BackgroundColour = application.NewRGB(250, 250, 248)
	opts.DevToolsEnabled = desktopDevMode()
	opts.UseApplicationMenu = true
	opts.Mac = application.MacWindow{}
	return opts
}

func desktopDevMode() bool {
	if os.Getenv("DEV") == "true" {
		return true
	}

	// `wails3 dev` injects the frontend dev server URL even when the app
	// process itself was not launched with an explicit DEV=true runtime env.
	return strings.TrimSpace(os.Getenv("FRONTEND_DEVSERVER_URL")) != ""
}

func appRoute(route string) string {
	if route == "" {
		route = "/"
	}
	if !strings.HasPrefix(route, "/") {
		route = "/" + route
	}
	if common.Base == "" || common.Base == "/" {
		return route
	}
	if route == "/" {
		return common.Base + "/"
	}
	return common.Base + route
}

func appURL(baseURL, route string) string {
	return strings.TrimRight(baseURL, "/") + appRoute(route)
}

func apiPath(route string) string {
	if common.Base == "" || common.Base == "/" {
		return route
	}
	return common.Base + route
}
