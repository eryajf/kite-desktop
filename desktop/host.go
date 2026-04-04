package main

import (
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"
	"github.com/zxh326/kite/pkg/common"
	kiteversion "github.com/zxh326/kite/pkg/version"
)

//go:embed build/appicon.png
var desktopTrayIcon []byte

type desktopPaths struct {
	DataDir         string
	LogsDir         string
	CacheDir        string
	TempDir         string
	DBPath          string
	WindowStatePath string
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
	app        *application.App
	baseURL    string
	paths      desktopPaths
	stateStore *desktopWindowStateStore

	mainWindow *application.WebviewWindow
	systemTray *application.SystemTray

	quitting atomic.Bool
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
	return &desktopHost{
		app:        app,
		baseURL:    baseURL,
		paths:      paths,
		stateStore: newDesktopWindowStateStore(paths.WindowStatePath),
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
		Name:           "main",
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

	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if h.quitting.Load() {
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
	})
	window.RegisterHook(events.Common.WindowDidResize, func(event *application.WindowEvent) {
		saveIfNormal()
	})
	window.RegisterHook(events.Common.WindowMaximise, func(event *application.WindowEvent) {
		h.saveMainWindowState(true)
	})
	window.RegisterHook(events.Common.WindowUnMaximise, func(event *application.WindowEvent) {
		h.saveMainWindowState(false)
	})

	if runtime.GOOS == "darwin" {
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
	_ = h.openApp()
}

func (h *desktopHost) hideMainWindow() {
	if h.mainWindow == nil {
		return
	}
	h.mainWindow.Hide()
}

func (h *desktopHost) quit() {
	h.quitting.Store(true)
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
	target := appRoute(route)
	h.mainWindow.ExecJS(fmt.Sprintf("window.location.assign(%s)", strconv.Quote(target)))
	h.focusMainWindow()
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

func (h *desktopHost) showInfoDialog(title, message string) {
	dialog := h.app.Dialog.Info().SetTitle(title).SetMessage(message)
	if h.mainWindow != nil {
		dialog.AttachToWindow(h.mainWindow)
	}
	dialog.Show()
}

func (h *desktopHost) showErrorDialog(title, message string) {
	dialog := h.app.Dialog.Error().SetTitle(title).SetMessage(message)
	if h.mainWindow != nil {
		dialog.AttachToWindow(h.mainWindow)
	}
	dialog.Show()
}

func (h *desktopHost) setupApplicationMenu() {
	menu := h.app.NewMenu()

	appMenu := menu.AddSubmenu("Kite")
	appMenu.Add("About Kite").OnClick(func(ctx *application.Context) {
		info := h.appInfo()
		h.showInfoDialog(
			"About Kite",
			fmt.Sprintf("Kite Desktop\nVersion: %s\nBuild Date: %s\nCommit: %s\nConfig Dir: %s", info.Version, info.BuildDate, info.CommitID, info.Paths.ConfigDir),
		)
	})
	appMenu.Add("Preferences").OnClick(func(ctx *application.Context) {
		h.navigate("/settings")
	})
	appMenu.AddSeparator()
	appMenu.Add("Quit").OnClick(func(ctx *application.Context) {
		h.quit()
	})

	fileMenu := menu.AddSubmenu("File")
	fileMenu.Add("Import kubeconfig").OnClick(func(ctx *application.Context) {
		if err := h.importKubeconfigFromDialog(); err != nil {
			h.showErrorDialog("Import kubeconfig failed", err.Error())
			return
		}
		h.reloadMainWindow()
	})
	fileMenu.Add("Open Config Directory").OnClick(func(ctx *application.Context) {
		if err := h.openConfigDir(); err != nil {
			h.showErrorDialog("Open config directory failed", err.Error())
		}
	})
	fileMenu.Add("Open Logs Directory").OnClick(func(ctx *application.Context) {
		if err := h.openLogsDir(); err != nil {
			h.showErrorDialog("Open logs directory failed", err.Error())
		}
	})

	viewMenu := menu.AddSubmenu("View")
	viewMenu.AddRole(application.Reload)
	viewMenu.AddRole(application.ResetZoom)
	viewMenu.AddRole(application.ZoomIn)
	viewMenu.AddRole(application.ZoomOut)
	viewMenu.AddRole(application.ToggleFullscreen)
	if desktopDevMode() {
		viewMenu.AddSeparator()
		viewMenu.AddRole(application.OpenDevTools)
	}

	windowMenu := menu.AddSubmenu("Window")
	windowMenu.AddRole(application.Minimise)
	windowMenu.AddRole(application.Zoom)
	if runtime.GOOS != "darwin" {
		windowMenu.AddRole(application.CloseWindow)
	}

	helpMenu := menu.AddSubmenu("Help")
	helpMenu.Add("Documentation").OnClick(func(ctx *application.Context) {
		_ = h.openExternalURL("https://github.com/eryajf/kite-desktop#readme")
	})
	helpMenu.Add("GitHub").OnClick(func(ctx *application.Context) {
		_ = h.openExternalURL("https://github.com/eryajf/kite-desktop")
	})
	helpMenu.Add("Report Issue").OnClick(func(ctx *application.Context) {
		_ = h.openExternalURL("https://github.com/eryajf/kite-desktop/issues/new")
	})

	h.app.Menu.SetApplicationMenu(menu)
}

func (h *desktopHost) setupSystemTray() {
	tray := h.app.SystemTray.New()
	tray.SetTooltip("Kite")

	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(icons.SystrayMacTemplate)
	} else if len(desktopTrayIcon) > 0 {
		tray.SetIcon(desktopTrayIcon)
	}

	menu := h.app.NewMenu()
	menu.Add("Show Kite").OnClick(func(ctx *application.Context) {
		h.focusMainWindow()
	})
	menu.Add("Import kubeconfig").OnClick(func(ctx *application.Context) {
		if err := h.importKubeconfigFromDialog(); err != nil {
			h.showErrorDialog("Import kubeconfig failed", err.Error())
			return
		}
		h.reloadMainWindow()
	})
	menu.Add("Open Config Directory").OnClick(func(ctx *application.Context) {
		if err := h.openConfigDir(); err != nil {
			h.showErrorDialog("Open config directory failed", err.Error())
		}
	})
	menu.Add("Open Logs Directory").OnClick(func(ctx *application.Context) {
		if err := h.openLogsDir(); err != nil {
			h.showErrorDialog("Open logs directory failed", err.Error())
		}
	})
	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(ctx *application.Context) {
		h.quit()
	})

	tray.SetMenu(menu)
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
	return os.Getenv("DEV") == "true"
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

func apiPath(route string) string {
	if common.Base == "" || common.Base == "/" {
		return route
	}
	return common.Base + route
}

func (h *desktopHost) openApp() error {
	if runtime.GOOS != "darwin" {
		return nil
	}
	return h.app.Browser.OpenURL("file:///")
}
