//go:build darwin || windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func waitForProcessExit(pid int, timeout time.Duration) error {
	if pid <= 0 {
		return nil
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		alive, err := processAlive(pid)
		if err != nil {
			return err
		}
		if !alive {
			return nil
		}
		time.Sleep(350 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for process %d to exit", pid)
}

func updaterLogPath() (string, error) {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(cacheDir, "Kite", "updater.log"), nil
}
