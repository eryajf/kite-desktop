package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	appserver "github.com/zxh326/kite/internal/server"
	"github.com/zxh326/kite/pkg/common"
)

//go:embed all:assets
var assets embed.FS

func main() {
	paths, err := resolveDesktopPaths()
	if err != nil {
		failDesktopStartup(err)
	}
	if err := paths.ensure(); err != nil {
		failDesktopStartup(err)
	}

	baseURL, runtime, listener, err := startLocalKite(paths)
	if err != nil {
		failDesktopStartup(err)
	}
	defer func() {
		_ = listener.Close()
	}()

	var host *desktopHost

	appOptions := application.Options{
		Name:        "Kite",
		Description: "Modern Kubernetes Dashboard",
		Icon:        desktopTrayIcon,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		OnShutdown: func() {
			if host != nil {
				host.persistStateOnShutdown()
			}

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := runtime.Shutdown(ctx); err != nil {
				log.Printf("shutdown server failed: %v", err)
			}
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	}

	if !desktopDevMode() {
		appOptions.SingleInstance = desktopSingleInstanceOptions(func() {
			if host != nil {
				host.focusMainWindow()
			}
		})
	}

	app := application.New(appOptions)

	host = newDesktopHost(app, baseURL, paths)

	bridge, err := newDesktopBridge(app, baseURL, host)
	if err != nil {
		failDesktopStartup(err)
	}
	bridge.registerRoutes(runtime.Engine)

	go func() {
		if err := runtime.Server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("desktop server stopped unexpectedly: %v", err)
		}
	}()

	if err := waitForServer(serverHealthURL(baseURL)); err != nil {
		failDesktopStartup(err)
	}

	mainWindow := app.Window.NewWithOptions(host.mainWindowOptions())
	host.registerMainWindow(mainWindow)
	host.setupApplicationMenu()
	host.setupSystemTray()

	if err := app.Run(); err != nil {
		failDesktopStartup(err)
	}
}

func startLocalKite(paths desktopPaths) (string, *appserver.Runtime, net.Listener, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, nil, fmt.Errorf("listen loopback failed: %w", err)
	}

	addr := listener.Addr().(*net.TCPAddr)
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", addr.Port)

	if err := configureDesktopEnv(paths, addr.Port); err != nil {
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

func configureDesktopEnv(paths desktopPaths, port int) error {
	if os.Getenv("DB_DSN") == "" {
		if err := os.Setenv("DB_DSN", paths.DBPath); err != nil {
			return fmt.Errorf("set DB_DSN failed: %w", err)
		}
	}

	if err := os.Setenv("PORT", strconv.Itoa(port)); err != nil {
		return fmt.Errorf("set PORT failed: %w", err)
	}
	if err := os.Setenv("HOST", fmt.Sprintf("http://127.0.0.1:%d", port)); err != nil {
		return fmt.Errorf("set HOST failed: %w", err)
	}
	if err := os.Setenv("APP_RUNTIME", common.RuntimeDesktopLocal); err != nil {
		return fmt.Errorf("set APP_RUNTIME failed: %w", err)
	}

	return nil
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
