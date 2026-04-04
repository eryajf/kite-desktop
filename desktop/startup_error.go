package main

import (
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"strings"
)

const desktopStartupErrorTitle = "Kite Desktop Failed to Start"

func failDesktopStartup(err error) {
	if err == nil {
		return
	}

	log.Printf("%s: %v", desktopStartupErrorTitle, err)
	if dialogErr := showStartupErrorDialog(err.Error()); dialogErr != nil {
		log.Printf("show startup error dialog failed: %v", dialogErr)
	}
	log.Fatal(err)
}

func showStartupErrorDialog(message string) error {
	message = strings.TrimSpace(message)
	if message == "" {
		message = "Unknown startup error"
	}

	switch runtime.GOOS {
	case "darwin":
		script := fmt.Sprintf(
			`display dialog %q with title %q buttons {"OK"} default button "OK" with icon stop`,
			message,
			desktopStartupErrorTitle,
		)
		return exec.Command("osascript", "-e", script).Run()
	case "windows":
		command := fmt.Sprintf(
			`Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show(%q, %q, 'OK', 'Error') | Out-Null`,
			message,
			desktopStartupErrorTitle,
		)
		return exec.Command("powershell", "-NoProfile", "-Command", command).Run()
	default:
		if _, err := exec.LookPath("zenity"); err == nil {
			return exec.Command(
				"zenity",
				"--error",
				"--title", desktopStartupErrorTitle,
				"--text", message,
			).Run()
		}
		if _, err := exec.LookPath("kdialog"); err == nil {
			return exec.Command(
				"kdialog",
				"--error",
				message,
				"--title",
				desktopStartupErrorTitle,
			).Run()
		}
	}

	return fmt.Errorf("no startup error dialog backend available")
}
