package model

import (
	"encoding/json"
	"errors"
	"strings"

	"gorm.io/gorm"
)

const currentDesktopPreferencesVersion = 1

type DesktopPreference struct {
	Model
	UserID          uint   `json:"userID" gorm:"uniqueIndex;not null"`
	PreferencesJSON string `json:"preferencesJSON" gorm:"column:preferences_json;type:text"`
}

type DesktopAppearancePreferences struct {
	Theme      string `json:"theme,omitempty"`
	ColorTheme string `json:"colorTheme,omitempty"`
	Font       string `json:"font,omitempty"`
	Language   string `json:"language,omitempty"`
}

type DesktopLogViewerPreferences struct {
	Theme           string `json:"theme,omitempty"`
	TailLines       int    `json:"tailLines,omitempty"`
	WordWrap        bool   `json:"wordWrap"`
	ShowLineNumbers bool   `json:"showLineNumbers"`
	FontSize        int    `json:"fontSize,omitempty"`
}

type DesktopTerminalPreferences struct {
	Theme       string `json:"theme,omitempty"`
	CursorStyle string `json:"cursorStyle,omitempty"`
	FontSize    int    `json:"fontSize,omitempty"`
}

type DesktopViewerPreferences struct {
	LogViewer DesktopLogViewerPreferences `json:"logViewer"`
	Terminal  DesktopTerminalPreferences  `json:"terminal"`
}

type DesktopWorkspacePreferences struct {
	CurrentCluster             string            `json:"currentCluster,omitempty"`
	RecentClusters             []string          `json:"recentClusters,omitempty"`
	SelectedNamespaceByCluster map[string]string `json:"selectedNamespaceByCluster,omitempty"`
}

type DesktopResourceTablePreferences struct {
	ColumnVisibilityByCluster map[string]map[string]map[string]bool `json:"columnVisibilityByCluster,omitempty"`
}

type DesktopUIPreferences struct {
	SettingsHintDismissed bool `json:"settingsHintDismissed"`
}

type DesktopPreferences struct {
	Version       int                             `json:"version"`
	Appearance    DesktopAppearancePreferences    `json:"appearance"`
	Viewer        DesktopViewerPreferences        `json:"viewer"`
	Workspace     DesktopWorkspacePreferences     `json:"workspace"`
	ResourceTable DesktopResourceTablePreferences `json:"resourceTable"`
	UI            DesktopUIPreferences            `json:"ui"`
}

func defaultDesktopPreferences() DesktopPreferences {
	return DesktopPreferences{
		Version: currentDesktopPreferencesVersion,
		Workspace: DesktopWorkspacePreferences{
			RecentClusters:             []string{},
			SelectedNamespaceByCluster: map[string]string{},
		},
		ResourceTable: DesktopResourceTablePreferences{
			ColumnVisibilityByCluster: map[string]map[string]map[string]bool{},
		},
	}
}

func GetDesktopPreferences() (DesktopPreferences, error) {
	prefs := defaultDesktopPreferences()
	if DB == nil {
		return prefs, nil
	}

	user, err := EnsureLocalDesktopUser()
	if err != nil {
		return prefs, err
	}

	var stored DesktopPreference
	err = DB.Where("user_id = ?", user.ID).First(&stored).Error
	switch {
	case err == nil:
		if raw := strings.TrimSpace(stored.PreferencesJSON); raw != "" {
			if err := json.Unmarshal([]byte(raw), &prefs); err != nil {
				return defaultDesktopPreferences(), err
			}
		}
	case errors.Is(err, gorm.ErrRecordNotFound):
		legacyJSON, legacyFound, legacyErr := loadLegacyDesktopPreferencesJSON(user.ID)
		if legacyErr != nil {
			return defaultDesktopPreferences(), legacyErr
		}
		if legacyFound {
			if err := json.Unmarshal([]byte(legacyJSON), &prefs); err != nil {
				return defaultDesktopPreferences(), err
			}
			if err := saveDesktopPreferencesRecord(user.ID, legacyJSON); err != nil {
				return defaultDesktopPreferences(), err
			}
		}
	default:
		return defaultDesktopPreferences(), err
	}

	if prefs.Version == 0 {
		prefs.Version = currentDesktopPreferencesVersion
	}
	if prefs.Workspace.RecentClusters == nil {
		prefs.Workspace.RecentClusters = []string{}
	}
	if prefs.Workspace.SelectedNamespaceByCluster == nil {
		prefs.Workspace.SelectedNamespaceByCluster = map[string]string{}
	}
	if prefs.ResourceTable.ColumnVisibilityByCluster == nil {
		prefs.ResourceTable.ColumnVisibilityByCluster =
			map[string]map[string]map[string]bool{}
	}

	if strings.TrimSpace(user.AppearancePreference) != "" &&
		prefs.Appearance == (DesktopAppearancePreferences{}) {
		_ = json.Unmarshal([]byte(user.AppearancePreference), &prefs.Appearance)
	}

	return prefs, nil
}

func SaveDesktopPreferences(prefs DesktopPreferences) error {
	if DB == nil {
		return nil
	}

	user, err := EnsureLocalDesktopUser()
	if err != nil {
		return err
	}

	if prefs.Version == 0 {
		prefs.Version = currentDesktopPreferencesVersion
	}
	if prefs.Workspace.RecentClusters == nil {
		prefs.Workspace.RecentClusters = []string{}
	}
	if prefs.Workspace.SelectedNamespaceByCluster == nil {
		prefs.Workspace.SelectedNamespaceByCluster = map[string]string{}
	}
	if prefs.ResourceTable.ColumnVisibilityByCluster == nil {
		prefs.ResourceTable.ColumnVisibilityByCluster =
			map[string]map[string]map[string]bool{}
	}

	payload, err := json.Marshal(prefs)
	if err != nil {
		return err
	}

	return saveDesktopPreferencesRecord(user.ID, string(payload))
}

func GetDesktopAppearancePreferences() (DesktopAppearancePreferences, error) {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return DesktopAppearancePreferences{}, err
	}
	return prefs.Appearance, nil
}

func SaveDesktopAppearancePreferences(pref DesktopAppearancePreferences) error {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return err
	}
	prefs.Appearance = pref
	return SaveDesktopPreferences(prefs)
}

func GetDesktopViewerPreferences() (DesktopViewerPreferences, error) {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return DesktopViewerPreferences{}, err
	}
	return prefs.Viewer, nil
}

func SaveDesktopViewerPreferences(pref DesktopViewerPreferences) error {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return err
	}
	prefs.Viewer = pref
	return SaveDesktopPreferences(prefs)
}

func GetDesktopWorkspacePreferences() (DesktopWorkspacePreferences, error) {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return DesktopWorkspacePreferences{}, err
	}
	return prefs.Workspace, nil
}

func SaveDesktopWorkspacePreferences(pref DesktopWorkspacePreferences) error {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return err
	}
	prefs.Workspace = pref
	return SaveDesktopPreferences(prefs)
}

func GetDesktopResourceTablePreferences() (DesktopResourceTablePreferences, error) {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return DesktopResourceTablePreferences{}, err
	}
	return prefs.ResourceTable, nil
}

func SaveDesktopResourceTablePreferences(pref DesktopResourceTablePreferences) error {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return err
	}
	prefs.ResourceTable = pref
	return SaveDesktopPreferences(prefs)
}

func GetDesktopUIPreferences() (DesktopUIPreferences, error) {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return DesktopUIPreferences{}, err
	}
	return prefs.UI, nil
}

func SaveDesktopUIPreferences(pref DesktopUIPreferences) error {
	prefs, err := GetDesktopPreferences()
	if err != nil {
		return err
	}
	prefs.UI = pref
	return SaveDesktopPreferences(prefs)
}

func saveDesktopPreferencesRecord(userID uint, desktopPreferences string) error {
	desktopPreferences = strings.TrimSpace(desktopPreferences)

	var existing DesktopPreference
	err := DB.Where("user_id = ?", userID).First(&existing).Error
	switch {
	case err == nil:
		return DB.Model(&DesktopPreference{}).
			Where("id = ?", existing.ID).
			Update("preferences_json", desktopPreferences).Error
	case errors.Is(err, gorm.ErrRecordNotFound):
		return DB.Create(&DesktopPreference{
			UserID:          userID,
			PreferencesJSON: desktopPreferences,
		}).Error
	default:
		return err
	}
}

func loadLegacyDesktopPreferencesJSON(userID uint) (string, bool, error) {
	if !DB.Migrator().HasColumn(&User{}, "desktop_preferences") {
		return "", false, nil
	}

	var legacyJSON string
	row := DB.Raw(
		"SELECT desktop_preferences FROM users WHERE id = ?",
		userID,
	).Row()
	if err := row.Scan(&legacyJSON); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		if err.Error() == "sql: no rows in result set" {
			return "", false, nil
		}
		return "", false, err
	}

	legacyJSON = strings.TrimSpace(legacyJSON)
	if legacyJSON == "" {
		return "", false, nil
	}

	return legacyJSON, true, nil
}
