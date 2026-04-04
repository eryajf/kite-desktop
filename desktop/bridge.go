package main

import (
	"fmt"
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

func newDesktopBridge(app *application.App, baseURL string) (*desktopBridge, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("parse desktop base url failed: %w", err)
	}

	return &desktopBridge{
		app:     app,
		baseURL: parsed,
	}, nil
}

func (d *desktopBridge) registerRoutes(engine *gin.Engine) {
	base := engine.Group(common.Base)
	api := base.Group("/api/desktop")
	api.GET("/status", d.handleStatus)
	api.POST("/open-url", d.handleOpenURL)
	api.POST("/open-file", d.handleOpenFile)
	api.POST("/save-file", d.handleSaveFile)
}

func (d *desktopBridge) handleStatus(c *gin.Context) {
	c.JSON(http.StatusOK, desktopStatusResponse{
		Enabled: common.DesktopLocalMode,
		Runtime: common.AppRuntime,
		Capabilities: desktopCapabilities{
			NativeFileDialog: true,
			NativeSaveDialog: true,
			Tray:             false,
			Menu:             false,
			SingleInstance:   false,
		},
	})
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
