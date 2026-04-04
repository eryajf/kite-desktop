package model

import (
	"testing"

	"github.com/zxh326/kite/pkg/utils"
)

func TestUserKey(t *testing.T) {
	tests := []struct {
		name     string
		user     User
		expected string
	}{
		{"username", User{Model: Model{ID: 1}, Username: "alice", Name: "Alice", Sub: "sub"}, "alice"},
		{"name", User{Model: Model{ID: 2}, Name: "Alice", Sub: "sub"}, "Alice"},
		{"sub", User{Model: Model{ID: 3}, Sub: "sub"}, "sub"},
		{"id", User{Model: Model{ID: 4}}, "4"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.user.Key(); got != tt.expected {
				t.Fatalf("Key() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestUserGetAPIKey(t *testing.T) {
	user := User{
		Model:  Model{ID: 42},
		APIKey: SecretString("secret"),
	}

	if got, want := user.GetAPIKey(), "kite42-secret"; got != want {
		t.Fatalf("GetAPIKey() = %q, want %q", got, want)
	}
}

func TestCheckPassword(t *testing.T) {
	hash, err := utils.HashPassword("secret")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if !CheckPassword(hash, "secret") {
		t.Fatal("CheckPassword() returned false for matching password")
	}
	if CheckPassword(hash, "wrong") {
		t.Fatal("CheckPassword() returned true for non-matching password")
	}
}

func TestGetLocalDesktopUser(t *testing.T) {
	user := GetLocalDesktopUser()

	if user.Username != "local" {
		t.Fatalf("Username = %q, want %q", user.Username, "local")
	}
	if user.Name != "Local User" {
		t.Fatalf("Name = %q, want %q", user.Name, "Local User")
	}
	if user.Provider != "DesktopLocal" {
		t.Fatalf("Provider = %q, want %q", user.Provider, "DesktopLocal")
	}
	if !user.Enabled {
		t.Fatal("Enabled = false, want true")
	}
	if len(user.Roles) != 1 || user.Roles[0].Name != "admin" {
		t.Fatalf("Roles = %#v, want one admin role", user.Roles)
	}

	user.Roles[0].Name = "changed"
	if LocalDesktopUser.Roles[0].Name != "admin" {
		t.Fatalf("LocalDesktopUser role mutated: %#v", LocalDesktopUser.Roles)
	}
}
