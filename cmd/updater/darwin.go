//go:build darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func applyPlatformUpdate(packagePath, targetPath, relaunchPath string) error {
	sourceApp, cleanup, err := prepareDarwinSourceApp(packagePath)
	if err != nil {
		return err
	}
	if cleanup != nil {
		defer cleanup()
	}

	targetPath = filepath.Clean(targetPath)
	backupPath := fmt.Sprintf("%s.backup-%d", targetPath, time.Now().Unix())
	_ = os.RemoveAll(backupPath)

	if _, err := os.Stat(targetPath); err == nil {
		if err := os.Rename(targetPath, backupPath); err != nil {
			return fmt.Errorf("rename existing app bundle: %w", err)
		}
	}

	if err := exec.Command("/usr/bin/ditto", sourceApp, targetPath).Run(); err != nil {
		if _, statErr := os.Stat(backupPath); statErr == nil {
			_ = os.RemoveAll(targetPath)
			_ = os.Rename(backupPath, targetPath)
		}
		return fmt.Errorf("copy new app bundle: %w", err)
	}

	_ = os.RemoveAll(backupPath)
	return exec.Command("/usr/bin/open", relaunchPath).Start()
}

func prepareDarwinSourceApp(packagePath string) (string, func(), error) {
	lowerPath := strings.ToLower(packagePath)
	tempDir, err := os.MkdirTemp("", "kite-updater-*")
	if err != nil {
		return "", nil, err
	}
	cleanup := func() {
		_ = os.RemoveAll(tempDir)
	}

	switch {
	case strings.HasSuffix(lowerPath, ".zip"):
		if err := exec.Command("/usr/bin/ditto", "-x", "-k", packagePath, tempDir).Run(); err != nil {
			cleanup()
			return "", nil, fmt.Errorf("extract zip update: %w", err)
		}
		appPath, err := findDarwinAppBundle(tempDir)
		if err != nil {
			cleanup()
			return "", nil, err
		}
		return appPath, cleanup, nil
	case strings.HasSuffix(lowerPath, ".dmg"):
		mountDir := filepath.Join(tempDir, "mount")
		if err := os.MkdirAll(mountDir, 0o755); err != nil {
			cleanup()
			return "", nil, err
		}
		if err := exec.Command("/usr/bin/hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mountDir, packagePath).Run(); err != nil {
			cleanup()
			return "", nil, fmt.Errorf("mount dmg update: %w", err)
		}
		detached := false
		detach := func() {
			if detached {
				return
			}
			_ = exec.Command("/usr/bin/hdiutil", "detach", mountDir).Run()
			detached = true
		}

		appPath, err := findDarwinAppBundle(mountDir)
		if err != nil {
			detach()
			cleanup()
			return "", nil, err
		}

		stagedApp := filepath.Join(tempDir, filepath.Base(appPath))
		if err := exec.Command("/usr/bin/ditto", appPath, stagedApp).Run(); err != nil {
			detach()
			cleanup()
			return "", nil, fmt.Errorf("stage app from dmg: %w", err)
		}
		detach()
		return stagedApp, cleanup, nil
	default:
		cleanup()
		return "", nil, fmt.Errorf("unsupported macOS update package: %s", filepath.Base(packagePath))
	}
}

func findDarwinAppBundle(root string) (string, error) {
	var found string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() && strings.HasSuffix(strings.ToLower(d.Name()), ".app") {
			found = path
			return filepath.SkipDir
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", fmt.Errorf("no .app bundle found in update package")
	}
	return found, nil
}
