package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	appserver "github.com/zxh326/kite/internal/server"
	"github.com/zxh326/kite/pkg/common"
)

//go:embed all:assets
var assets embed.FS

func main() {
	baseURL, runtime, listener, err := startLocalKite()
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()

	app := application.New(application.Options{
		Name:        "Kite",
		Description: "Modern Kubernetes Dashboard",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		OnShutdown: func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := runtime.Shutdown(ctx); err != nil {
				log.Printf("shutdown server failed: %v", err)
			}
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	bridge, err := newDesktopBridge(app, baseURL)
	if err != nil {
		log.Fatal(err)
	}
	bridge.registerRoutes(runtime.Engine)

	go func() {
		if err := runtime.Server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("desktop server stopped unexpectedly: %v", err)
		}
	}()

	if err := waitForServer(serverHealthURL(baseURL)); err != nil {
		log.Fatal(err)
	}

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:               "main",
		Title:              "Kite",
		Width:              1480,
		Height:             960,
		MinWidth:           1100,
		MinHeight:          760,
		BackgroundColour:   application.NewRGB(250, 250, 248),
		DevToolsEnabled:    true,
		EnableFileDrop:     true,
		UseApplicationMenu: true,
		URL:                serverStartURL(baseURL),
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHiddenInset,
		},
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func startLocalKite() (string, *appserver.Runtime, net.Listener, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, nil, fmt.Errorf("listen loopback failed: %w", err)
	}

	addr := listener.Addr().(*net.TCPAddr)
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", addr.Port)

	if err := configureDesktopEnv(addr.Port); err != nil {
		_ = listener.Close()
		return "", nil, nil, err
	}

	runtime, err := appserver.NewRuntime(listener.Addr().String())
	if err != nil {
		_ = listener.Close()
		return "", nil, nil, fmt.Errorf("initialise desktop runtime failed: %w", err)
	}

	return baseURL, runtime, listener, nil
}

func configureDesktopEnv(port int) error {
	dataDir, err := desktopDataDir()
	if err != nil {
		return fmt.Errorf("resolve desktop data dir failed: %w", err)
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return fmt.Errorf("create desktop data dir failed: %w", err)
	}

	if os.Getenv("DB_DSN") == "" {
		if err := os.Setenv("DB_DSN", filepath.Join(dataDir, "kite.db")); err != nil {
			return fmt.Errorf("set DB_DSN failed: %w", err)
		}
	}

	if err := os.Setenv("PORT", strconv.Itoa(port)); err != nil {
		return fmt.Errorf("set PORT failed: %w", err)
	}
	if err := os.Setenv("HOST", fmt.Sprintf("http://127.0.0.1:%d", port)); err != nil {
		return fmt.Errorf("set HOST failed: %w", err)
	}
	if err := os.Setenv("ANONYMOUS_USER_ENABLED", "true"); err != nil {
		return fmt.Errorf("set ANONYMOUS_USER_ENABLED failed: %w", err)
	}

	return nil
}

func desktopDataDir() (string, error) {
	baseDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(baseDir, "Kite"), nil
}

func waitForServer(url string) error {
	client := &http.Client{Timeout: 800 * time.Millisecond}
	deadline := time.Now().Add(5 * time.Second)

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		time.Sleep(150 * time.Millisecond)
	}

	return fmt.Errorf("desktop backend did not become ready in time")
}

func serverStartURL(baseURL string) string {
	if common.Base == "" || common.Base == "/" {
		return baseURL + "/"
	}
	return baseURL + common.Base + "/"
}

func serverHealthURL(baseURL string) string {
	if common.Base == "" || common.Base == "/" {
		return baseURL + "/healthz"
	}
	return baseURL + common.Base + "/healthz"
}
