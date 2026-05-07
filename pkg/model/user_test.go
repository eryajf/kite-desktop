package model

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/utils"
)

func TestMain(m *testing.M) {
	tempDir, err := os.MkdirTemp("", "kite-model-tests-*")
	if err != nil {
		panic(err)
	}

	common.DBType = "sqlite"
	common.DBDSN = filepath.Join(tempDir, "model-test.db")
	InitDB()

	exitCode := m.Run()
	if err := os.RemoveAll(tempDir); err != nil {
		fmt.Fprintf(os.Stderr, "cleanup temp dir %q failed: %v\n", tempDir, err)
		if exitCode == 0 {
			exitCode = 1
		}
	}

	os.Exit(exitCode)
}

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

func TestUpdateUserSidebarPreference_LocalDesktopUser(t *testing.T) {
	if err := DB.Where("username = ?", LocalDesktopUser.Username).Delete(&User{}).Error; err != nil {
		t.Fatalf("cleanup local desktop user failed: %v", err)
	}

	user := GetLocalDesktopUser()
	if err := UpdateUserSidebarPreference(&user, `{"groups":[]}`); err != nil {
		t.Fatalf("UpdateUserSidebarPreference() create path error = %v", err)
	}
	if user.ID == 0 {
		t.Fatal("UpdateUserSidebarPreference() did not hydrate local user ID")
	}

	reloaded, err := GetUserByUsername(LocalDesktopUser.Username)
	if err != nil {
		t.Fatalf("GetUserByUsername() error = %v", err)
	}
	if reloaded.Provider != LocalDesktopUser.Provider {
		t.Fatalf("Provider = %q, want %q", reloaded.Provider, LocalDesktopUser.Provider)
	}
	if reloaded.SidebarPreference != `{"groups":[]}` {
		t.Fatalf("SidebarPreference = %q, want %q", reloaded.SidebarPreference, `{"groups":[]}`)
	}

	user = GetLocalDesktopUser()
	if err := UpdateUserSidebarPreference(&user, `{"hiddenItems":["deployments"]}`); err != nil {
		t.Fatalf("UpdateUserSidebarPreference() update path error = %v", err)
	}

	reloaded, err = GetUserByUsername(LocalDesktopUser.Username)
	if err != nil {
		t.Fatalf("GetUserByUsername() second reload error = %v", err)
	}
	if reloaded.SidebarPreference != `{"hiddenItems":["deployments"]}` {
		t.Fatalf("SidebarPreference after update = %q, want %q", reloaded.SidebarPreference, `{"hiddenItems":["deployments"]}`)
	}
}

func TestUpdateUserAppearancePreference_LocalDesktopUser(t *testing.T) {
	if err := DB.Where("username = ?", LocalDesktopUser.Username).Delete(&User{}).Error; err != nil {
		t.Fatalf("cleanup local desktop user failed: %v", err)
	}

	user := GetLocalDesktopUser()
	if err := UpdateUserAppearancePreference(&user, `{"theme":"dark"}`); err != nil {
		t.Fatalf("UpdateUserAppearancePreference() create path error = %v", err)
	}
	if user.ID == 0 {
		t.Fatal("UpdateUserAppearancePreference() did not hydrate local user ID")
	}

	reloaded, err := GetUserByUsername(LocalDesktopUser.Username)
	if err != nil {
		t.Fatalf("GetUserByUsername() error = %v", err)
	}
	if reloaded.Provider != LocalDesktopUser.Provider {
		t.Fatalf("Provider = %q, want %q", reloaded.Provider, LocalDesktopUser.Provider)
	}
	if reloaded.AppearancePreference != `{"theme":"dark"}` {
		t.Fatalf("AppearancePreference = %q, want %q", reloaded.AppearancePreference, `{"theme":"dark"}`)
	}

	user = GetLocalDesktopUser()
	if err := UpdateUserAppearancePreference(&user, `{"theme":"light","font":"system"}`); err != nil {
		t.Fatalf("UpdateUserAppearancePreference() update path error = %v", err)
	}

	reloaded, err = GetUserByUsername(LocalDesktopUser.Username)
	if err != nil {
		t.Fatalf("GetUserByUsername() second reload error = %v", err)
	}
	if reloaded.AppearancePreference != `{"theme":"light","font":"system"}` {
		t.Fatalf("AppearancePreference after update = %q, want %q", reloaded.AppearancePreference, `{"theme":"light","font":"system"}`)
	}
}

func TestSaveDesktopPreferences_LocalDesktopUser(t *testing.T) {
	if err := DB.Where("username = ?", LocalDesktopUser.Username).Delete(&User{}).Error; err != nil {
		t.Fatalf("cleanup local desktop user failed: %v", err)
	}
	if err := DB.Where("1 = 1").Delete(&DesktopPreference{}).Error; err != nil {
		t.Fatalf("cleanup desktop preferences failed: %v", err)
	}

	prefs := DesktopPreferences{
		Version: 1,
		Workspace: DesktopWorkspacePreferences{
			CurrentCluster: "prod",
			RecentClusters: []string{"prod", "staging"},
			SelectedNamespaceByCluster: map[string]string{
				"prod": "kube-system",
			},
		},
	}

	if err := SaveDesktopPreferences(prefs); err != nil {
		t.Fatalf("SaveDesktopPreferences() error = %v", err)
	}

	reloaded, err := GetDesktopPreferences()
	if err != nil {
		t.Fatalf("GetDesktopPreferences() error = %v", err)
	}

	if reloaded.Workspace.CurrentCluster != "prod" {
		t.Fatalf("Workspace.CurrentCluster = %q, want %q", reloaded.Workspace.CurrentCluster, "prod")
	}
	if len(reloaded.Workspace.RecentClusters) != 2 {
		t.Fatalf("Workspace.RecentClusters len = %d, want %d", len(reloaded.Workspace.RecentClusters), 2)
	}
	if got := reloaded.Workspace.SelectedNamespaceByCluster["prod"]; got != "kube-system" {
		t.Fatalf("Workspace.SelectedNamespaceByCluster[prod] = %q, want %q", got, "kube-system")
	}

	user, err := GetUserByUsername(LocalDesktopUser.Username)
	if err != nil {
		t.Fatalf("GetUserByUsername() error = %v", err)
	}

	var stored DesktopPreference
	if err := DB.Where("user_id = ?", user.ID).First(&stored).Error; err != nil {
		t.Fatalf("desktop preference row query error = %v", err)
	}
	if stored.PreferencesJSON == "" {
		t.Fatal("PreferencesJSON is empty, want persisted JSON")
	}
}

func TestGetDesktopPreferences_MigratesLegacyUserColumn(t *testing.T) {
	if err := DB.Where("username = ?", LocalDesktopUser.Username).Delete(&User{}).Error; err != nil {
		t.Fatalf("cleanup local desktop user failed: %v", err)
	}
	if err := DB.Where("1 = 1").Delete(&DesktopPreference{}).Error; err != nil {
		t.Fatalf("cleanup desktop preferences failed: %v", err)
	}

	user, err := EnsureLocalDesktopUser()
	if err != nil {
		t.Fatalf("EnsureLocalDesktopUser() error = %v", err)
	}

	if err := DB.Exec("ALTER TABLE users ADD COLUMN desktop_preferences TEXT").Error; err != nil &&
		err.Error() != "SQL logic error: duplicate column name: desktop_preferences (1)" {
		t.Fatalf("add legacy desktop_preferences column error = %v", err)
	}

	legacyJSON := `{"version":1,"workspace":{"currentCluster":"legacy","recentClusters":["legacy"]}}`
	if err := DB.Exec(
		"UPDATE users SET desktop_preferences = ? WHERE id = ?",
		legacyJSON,
		user.ID,
	).Error; err != nil {
		t.Fatalf("seed legacy desktop_preferences error = %v", err)
	}

	reloaded, err := GetDesktopPreferences()
	if err != nil {
		t.Fatalf("GetDesktopPreferences() error = %v", err)
	}

	if reloaded.Workspace.CurrentCluster != "legacy" {
		t.Fatalf("Workspace.CurrentCluster = %q, want %q", reloaded.Workspace.CurrentCluster, "legacy")
	}

	var stored DesktopPreference
	if err := DB.Where("user_id = ?", user.ID).First(&stored).Error; err != nil {
		t.Fatalf("migrated desktop preference row query error = %v", err)
	}
	if stored.PreferencesJSON != legacyJSON {
		t.Fatalf("PreferencesJSON = %q, want %q", stored.PreferencesJSON, legacyJSON)
	}
}
