package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func (h *desktopHost) applyReadyUpdate() error {
	if h.updateStore == nil {
		return fmt.Errorf("desktop update store unavailable")
	}

	state := h.updateStore.load()
	if state.ReadyToApply == nil || strings.TrimSpace(state.ReadyToApply.Path) == "" {
		return fmt.Errorf("no downloaded update is ready to apply")
	}
	if _, err := os.Stat(state.ReadyToApply.Path); err != nil {
		return fmt.Errorf("downloaded update package is missing")
	}

	targetPath, relaunchPath, err := currentUpdateTargetPaths()
	if err != nil {
		return err
	}
	updaterPath, err := stagedUpdaterPath(h.paths.TempDir)
	if err != nil {
		return err
	}

	cmd := exec.Command(
		updaterPath,
		"--pid", strconv.Itoa(os.Getpid()),
		"--package", state.ReadyToApply.Path,
		"--target", targetPath,
		"--relaunch", relaunchPath,
	)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("launch updater: %w", err)
	}

	go func() {
		time.Sleep(300 * time.Millisecond)
		h.quit()
	}()
	return nil
}

func stagedUpdaterPath(tempDir string) (string, error) {
	sourcePath, err := installedUpdaterPath()
	if err != nil {
		return "", err
	}

	targetDir := filepath.Join(tempDir, "updater")
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return "", err
	}

	targetName := filepath.Base(sourcePath)
	targetPath := filepath.Join(targetDir, fmt.Sprintf("%d-%s", time.Now().UnixNano(), targetName))
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return "", fmt.Errorf("read bundled updater: %w", err)
	}
	if err := os.WriteFile(targetPath, content, 0o755); err != nil {
		return "", fmt.Errorf("write staged updater: %w", err)
	}
	return targetPath, nil
}

func installedUpdaterPath() (string, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve executable path: %w", err)
	}
	executablePath, _ = filepath.EvalSymlinks(executablePath)

	candidates := make([]string, 0, 4)
	switch runtime.GOOS {
	case "darwin":
		appBundle := currentDarwinAppBundlePath(executablePath)
		if appBundle != "" {
			candidates = append(candidates,
				filepath.Join(appBundle, "Contents", "Resources", "kite-updater"),
				filepath.Join(appBundle, "Contents", "MacOS", "kite-updater"),
			)
		}
		candidates = append(candidates, filepath.Join(filepath.Dir(executablePath), "kite-updater"))
	case "windows":
		candidates = append(candidates, filepath.Join(filepath.Dir(executablePath), "kite-updater.exe"))
	default:
		return "", fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("bundled updater executable not found")
}

func currentUpdateTargetPaths() (string, string, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return "", "", fmt.Errorf("resolve executable path: %w", err)
	}
	executablePath, _ = filepath.EvalSymlinks(executablePath)

	switch runtime.GOOS {
	case "darwin":
		appBundle := currentDarwinAppBundlePath(executablePath)
		if appBundle == "" {
			return "", "", fmt.Errorf("unable to resolve current .app bundle path")
		}
		return appBundle, appBundle, nil
	case "windows":
		return executablePath, executablePath, nil
	default:
		return "", "", fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

func currentDarwinAppBundlePath(executablePath string) string {
	dir := filepath.Dir(executablePath)
	for dir != "." && dir != "/" {
		if strings.HasSuffix(strings.ToLower(dir), ".app") {
			return dir
		}
		nextDir := filepath.Dir(dir)
		if nextDir == dir {
			break
		}
		dir = nextDir
	}
	return ""
}
