package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"

	"github.com/gin-gonic/gin"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/zxh326/kite/pkg/common"
)

type desktopBridge struct {
	app         *application.App
	host        *desktopHost
	baseURL     *url.URL
	windowIndex atomic.Uint64
}

type desktopCapabilities struct {
	NativeFileDialog bool `json:"nativeFileDialog"`
	NativeSaveDialog bool `json:"nativeSaveDialog"`
	Tray             bool `json:"tray"`
	Menu             bool `json:"menu"`
	SingleInstance   bool `json:"singleInstance"`
}

type desktopStatusResponse struct {
	Enabled      bool                `json:"enabled"`
	Runtime      string              `json:"runtime"`
	Capabilities desktopCapabilities `json:"capabilities"`
}

type desktopActionResponse struct {
	OK bool `json:"ok"`
}

type desktopAppPaths struct {
	ConfigDir string `json:"configDir"`
	LogsDir   string `json:"logsDir"`
	CacheDir  string `json:"cacheDir"`
	TempDir   string `json:"tempDir"`
}

type desktopAppInfoResponse struct {
	Name      string          `json:"name"`
	Runtime   string          `json:"runtime"`
	Version   string          `json:"version"`
	BuildDate string          `json:"buildDate"`
	CommitID  string          `json:"commitId"`
	Paths     desktopAppPaths `json:"paths"`
}

type openURLRequest struct {
	URL       string `json:"url"`
	Title     string `json:"title"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	MinWidth  int    `json:"minWidth"`
	MinHeight int    `json:"minHeight"`
}

type openFileRequest struct {
	Title       string           `json:"title"`
	Message     string           `json:"message"`
	ButtonText  string           `json:"buttonText"`
	Directory   string           `json:"directory"`
	ReadContent bool             `json:"readContent"`
	Filters     []openFileFilter `json:"filters"`
}

type openFileFilter struct {
	DisplayName string `json:"displayName"`
	Pattern     string `json:"pattern"`
}

type openFileResponse struct {
	Canceled bool   `json:"canceled"`
	Path     string `json:"path,omitempty"`
	Name     string `json:"name,omitempty"`
	Content  string `json:"content,omitempty"`
}

type saveFileRequest struct {
	Title         string           `json:"title"`
	Message       string           `json:"message"`
	ButtonText    string           `json:"buttonText"`
	Directory     string           `json:"directory"`
	SuggestedName string           `json:"suggestedName"`
	Content       string           `json:"content"`
	Filters       []openFileFilter `json:"filters"`
}

type saveFileResponse struct {
	Canceled bool   `json:"canceled"`
	Path     string `json:"path,omitempty"`
}

type downloadToPathRequest struct {
	Title         string           `json:"title"`
	Message       string           `json:"message"`
	ButtonText    string           `json:"buttonText"`
	Directory     string           `json:"directory"`
	SuggestedName string           `json:"suggestedName"`
	URL           string           `json:"url"`
	Filters       []openFileFilter `json:"filters"`
}

type downloadToPathResponse struct {
	Canceled     bool   `json:"canceled"`
	Path         string `json:"path,omitempty"`
	BytesWritten int64  `json:"bytesWritten,omitempty"`
}

type desktopPathRequest struct {
	Path string `json:"path"`
}

type desktopCopyRequest struct {
	Text string `json:"text"`
}

type desktopImportKubeconfigRequest struct {
	Content string `json:"content"`
}

func newDesktopBridge(app *application.App, baseURL string, host *desktopHost) (*desktopBridge, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("parse desktop base url failed: %w", err)
	}

	return &desktopBridge{
		app:     app,
		host:    host,
		baseURL: parsed,
	}, nil
}

func (d *desktopBridge) registerRoutes(engine *gin.Engine) {
	base := engine.Group(common.Base)
	api := base.Group("/api/desktop")
	api.GET("/status", d.handleStatus)
	api.GET("/app-info", d.handleAppInfo)
	api.POST("/open-url", d.handleOpenURL)
	api.POST("/open-file", d.handleOpenFile)
	api.POST("/save-file", d.handleSaveFile)
	api.POST("/download-to-path", d.handleDownloadToPath)
	api.POST("/open-path", d.handleOpenPath)
	api.POST("/reveal-path", d.handleRevealPath)
	api.POST("/open-logs-dir", d.handleOpenLogsDir)
	api.POST("/open-config-dir", d.handleOpenConfigDir)
	api.POST("/window/focus", d.handleFocusWindow)
	api.POST("/window/hide", d.handleHideWindow)
	api.POST("/window/quit", d.handleQuitWindow)
	api.POST("/copy-to-clipboard", d.handleCopyToClipboard)
	api.POST("/import-kubeconfig", d.handleImportKubeconfig)
}

func (d *desktopBridge) handleStatus(c *gin.Context) {
	capabilities := desktopCapabilities{}
	if d.host != nil {
		capabilities = d.host.capabilities()
	}

	c.JSON(http.StatusOK, desktopStatusResponse{
		Enabled:      common.DesktopLocalMode,
		Runtime:      common.AppRuntime,
		Capabilities: capabilities,
	})
}

func (d *desktopBridge) handleAppInfo(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}

	c.JSON(http.StatusOK, d.host.appInfo())
}

func (d *desktopBridge) handleOpenURL(c *gin.Context) {
	var req openURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid open-url payload"})
		return
	}
	if strings.TrimSpace(req.URL) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	targetURL, internal, err := d.resolveURL(req.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if internal {
		d.openInternalWindow(targetURL.String(), req)
		c.JSON(http.StatusOK, gin.H{"ok": true, "mode": "window"})
		return
	}

	if err := d.app.Browser.OpenURL(targetURL.String()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "mode": "browser"})
}

func (d *desktopBridge) handleOpenFile(c *gin.Context) {
	var req openFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid open-file payload"})
		return
	}

	dialog := d.app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false)

	if req.Title != "" {
		dialog.SetTitle(req.Title)
	}
	if req.Message != "" {
		dialog.SetMessage(req.Message)
	}
	if req.ButtonText != "" {
		dialog.SetButtonText(req.ButtonText)
	}
	if req.Directory != "" {
		dialog.SetDirectory(req.Directory)
	} else if defaultDir := defaultKubeconfigDir(); defaultDir != "" {
		dialog.SetDirectory(defaultDir)
	}
	if window, ok := d.app.Window.GetByName("main"); ok {
		dialog.AttachToWindow(window)
	}
	for _, filter := range req.Filters {
		if filter.DisplayName == "" || filter.Pattern == "" {
			continue
		}
		dialog.AddFilter(filter.DisplayName, filter.Pattern)
	}

	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if path == "" {
		c.JSON(http.StatusOK, openFileResponse{Canceled: true})
		return
	}

	resp := openFileResponse{
		Path: path,
		Name: filepath.Base(path),
	}
	if req.ReadContent {
		content, err := os.ReadFile(path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		resp.Content = string(content)
	}

	c.JSON(http.StatusOK, resp)
}

func (d *desktopBridge) handleSaveFile(c *gin.Context) {
	var req saveFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid save-file payload"})
		return
	}

	dialog := d.app.Dialog.SaveFile().CanCreateDirectories(true)
	if req.Message != "" {
		dialog.SetMessage(req.Message)
	}
	if req.ButtonText != "" {
		dialog.SetButtonText(req.ButtonText)
	}
	if req.Directory != "" {
		dialog.SetDirectory(req.Directory)
	}
	if req.SuggestedName != "" {
		dialog.SetFilename(req.SuggestedName)
	}
	if window, ok := d.app.Window.GetByName("main"); ok {
		dialog.AttachToWindow(window)
	}
	for _, filter := range req.Filters {
		if filter.DisplayName == "" || filter.Pattern == "" {
			continue
		}
		dialog.AddFilter(filter.DisplayName, filter.Pattern)
	}

	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if path == "" {
		c.JSON(http.StatusOK, saveFileResponse{Canceled: true})
		return
	}
	if err := os.WriteFile(path, []byte(req.Content), 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, saveFileResponse{
		Canceled: false,
		Path:     path,
	})
}

func (d *desktopBridge) handleDownloadToPath(c *gin.Context) {
	var req downloadToPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid download-to-path payload"})
		return
	}
	if strings.TrimSpace(req.URL) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
		return
	}

	targetURL, _, err := d.resolveURL(req.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dialog := d.app.Dialog.SaveFile().CanCreateDirectories(true)
	if req.Message != "" {
		dialog.SetMessage(req.Message)
	}
	if req.ButtonText != "" {
		dialog.SetButtonText(req.ButtonText)
	}
	if req.Directory != "" {
		dialog.SetDirectory(req.Directory)
	}
	if req.SuggestedName != "" {
		dialog.SetFilename(req.SuggestedName)
	} else if name := filepath.Base(targetURL.Path); name != "" && name != "." && name != "/" {
		dialog.SetFilename(name)
	}
	if window, ok := d.app.Window.GetByName("main"); ok {
		dialog.AttachToWindow(window)
	}
	for _, filter := range req.Filters {
		if filter.DisplayName == "" || filter.Pattern == "" {
			continue
		}
		dialog.AddFilter(filter.DisplayName, filter.Pattern)
	}

	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if path == "" {
		c.JSON(http.StatusOK, downloadToPathResponse{Canceled: true})
		return
	}

	bytesWritten, err := d.downloadToPath(targetURL.String(), path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, downloadToPathResponse{
		Canceled:     false,
		Path:         path,
		BytesWritten: bytesWritten,
	})
}

func (d *desktopBridge) handleOpenPath(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}

	var req desktopPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid open-path payload"})
		return
	}
	if err := d.host.openPath(req.Path); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleRevealPath(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}

	var req desktopPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid reveal-path payload"})
		return
	}
	if err := d.host.revealPath(req.Path); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleOpenLogsDir(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}
	if err := d.host.openLogsDir(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleOpenConfigDir(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}
	if err := d.host.openConfigDir(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleFocusWindow(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}
	d.host.focusMainWindow()
	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleHideWindow(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}
	d.host.hideMainWindow()
	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleQuitWindow(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}
	d.host.quit()
	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleCopyToClipboard(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}

	var req desktopCopyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid copy-to-clipboard payload"})
		return
	}
	if err := d.host.copyToClipboard(req.Text); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) handleImportKubeconfig(c *gin.Context) {
	if d.host == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "desktop host unavailable"})
		return
	}

	var req desktopImportKubeconfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid import-kubeconfig payload"})
		return
	}

	var err error
	if strings.TrimSpace(req.Content) != "" {
		err = d.host.importKubeconfigContent(req.Content)
	} else {
		err = d.host.importKubeconfigFromDialog()
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, desktopActionResponse{OK: true})
}

func (d *desktopBridge) resolveURL(rawURL string) (*url.URL, bool, error) {
	target, err := url.Parse(rawURL)
	if err != nil {
		return nil, false, fmt.Errorf("invalid url: %w", err)
	}

	internal := !target.IsAbs()
	if internal {
		return d.baseURL.ResolveReference(target), true, nil
	}

	if sameOrigin(target, d.baseURL) {
		return target, true, nil
	}

	return target, false, nil
}

func (d *desktopBridge) openInternalWindow(targetURL string, req openURLRequest) {
	index := d.windowIndex.Add(1)
	title := req.Title
	if title == "" {
		title = "Kite"
	}

	width := req.Width
	if width <= 0 {
		width = 1280
	}
	height := req.Height
	if height <= 0 {
		height = 860
	}
	minWidth := req.MinWidth
	if minWidth <= 0 {
		minWidth = 960
	}
	minHeight := req.MinHeight
	if minHeight <= 0 {
		minHeight = 680
	}

	d.app.Window.NewWithOptions(desktopWindowOptions(application.WebviewWindowOptions{
		Name:      fmt.Sprintf("desktop-%d", index),
		Title:     title,
		URL:       targetURL,
		Width:     width,
		Height:    height,
		MinWidth:  minWidth,
		MinHeight: minHeight,
	}))
}

func (d *desktopBridge) downloadToPath(rawURL, path string) (int64, error) {
	response, err := http.Get(rawURL)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return 0, fmt.Errorf("download failed with status %d", response.StatusCode)
	}

	file, err := os.Create(path)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	return io.Copy(file, response.Body)
}

func sameOrigin(left *url.URL, right *url.URL) bool {
	return strings.EqualFold(left.Scheme, right.Scheme) &&
		strings.EqualFold(left.Host, right.Host)
}

func defaultKubeconfigDir() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(homeDir, ".kube")
}
