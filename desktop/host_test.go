package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestBuildApplicationMenuIncludesEditMenu(t *testing.T) {
	menu := buildApplicationMenu(nil, false)
	if menu.FindByRole(application.EditMenu) == nil {
		t.Fatal("expected application menu to include Edit menu role for standard clipboard shortcuts")
	}
}
