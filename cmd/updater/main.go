//go:build darwin || windows

package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func main() {
	var (
		pid          = flag.Int("pid", 0, "PID of the process to wait for before applying the update")
		packagePath  = flag.String("package", "", "Path to the downloaded update package")
		targetPath   = flag.String("target", "", "Target application path to replace or relaunch")
		relaunchPath = flag.String("relaunch", "", "Executable or app path to relaunch after update")
	)
	flag.Parse()

	if *packagePath == "" {
		fatalf("missing required flag: --package")
	}
	if *targetPath == "" {
		fatalf("missing required flag: --target")
	}

	if *relaunchPath == "" {
		*relaunchPath = *targetPath
	}

	if *pid > 0 {
		if err := waitForProcessExit(*pid, 90*time.Second); err != nil {
			fatalf("wait for pid %d: %v", *pid, err)
		}
	}

	err := applyPlatformUpdate(*packagePath, *targetPath, *relaunchPath)
	if err != nil {
		fatalf("apply update failed: %v", err)
	}
}

func fatalf(format string, args ...any) {
	message := fmt.Sprintf(format, args...)
	_, _ = fmt.Fprintln(os.Stderr, message)
	if logPath, err := updaterLogPath(); err == nil {
		_ = os.MkdirAll(filepath.Dir(logPath), 0o755)
		_ = os.WriteFile(logPath, []byte(message+"\n"), 0o644)
	}
	os.Exit(1)
}
