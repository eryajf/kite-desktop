//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

func applyPlatformUpdate(packagePath, targetPath, relaunchPath string) error {
	_ = targetPath
	_ = relaunchPath

	lowerPath := strings.ToLower(packagePath)
	if !strings.HasSuffix(lowerPath, ".exe") {
		return fmt.Errorf("unsupported windows update package: %s", filepath.Base(packagePath))
	}

	cmd := exec.Command(packagePath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("launch installer: %w", err)
	}
	return nil
}
