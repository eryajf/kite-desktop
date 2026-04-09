package version

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/gin-gonic/gin"
)

var (
	Version   = "dev"
	BuildDate = "unknown"
	CommitID  = "unknown"
)

type VersionInfo struct {
	Version   string `json:"version"`
	BuildDate string `json:"buildDate"`
	CommitID  string `json:"commitId"`
	HasNew    bool   `json:"hasNewVersion"`
	Release   string `json:"releaseUrl"`
}

type UpdateCheckRequest struct {
	Force bool `json:"force"`
}

type UpdateCheckInfo struct {
	CurrentVersion string           `json:"currentVersion"`
	LatestVersion  string           `json:"latestVersion"`
	Comparison     UpdateComparison `json:"comparison"`
	HasNew         bool             `json:"hasNewVersion"`
	Release        string           `json:"releaseUrl"`
	ReleaseNotes   string           `json:"releaseNotes"`
	PublishedAt    string           `json:"publishedAt"`
	Ignored        bool             `json:"ignored"`
	AssetAvailable bool             `json:"assetAvailable"`
	Asset          *UpdateAsset     `json:"asset,omitempty"`
	CheckedAt      string           `json:"checkedAt"`
}

func GetVersion(c *gin.Context) {
	versionInfo := VersionInfo{
		Version:   Version,
		BuildDate: BuildDate,
		CommitID:  CommitID,
	}

	if common.EnableVersionCheck {
		r, err := checkForUpdate(c.Request.Context(), Version, false)
		if err == nil {
			versionInfo.HasNew = r.comparison == UpdateComparisonUpdateAvailable
			if versionInfo.HasNew {
				versionInfo.Release = r.releaseURL
			}
		}
	}
	c.JSON(http.StatusOK, versionInfo)
}

func CheckUpdate(c *gin.Context) {
	var req UpdateCheckRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid update-check payload"})
		return
	}

	result, err := checkForUpdate(c.Request.Context(), Version, req.Force)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result.toInfo(Version))
}

func formatCheckedAt(checkedAt time.Time) string {
	if checkedAt.IsZero() {
		return ""
	}
	return checkedAt.Format(time.RFC3339)
}

func GetUpdateCheckInfo(ctx context.Context, currentVersion string, force bool) (UpdateCheckInfo, error) {
	result, err := checkForUpdate(ctx, currentVersion, force)
	if err != nil {
		return UpdateCheckInfo{}, err
	}
	return result.toInfo(currentVersion), nil
}

func (r updateCheckResult) toInfo(currentVersion string) UpdateCheckInfo {
	return UpdateCheckInfo{
		CurrentVersion: strings.TrimPrefix(currentVersion, "v"),
		LatestVersion:  strings.TrimPrefix(r.latestVersion, "v"),
		Comparison:     r.comparison,
		HasNew:         r.comparison == UpdateComparisonUpdateAvailable,
		Release:        r.releaseURL,
		ReleaseNotes:   r.releaseNotes,
		PublishedAt:    r.publishedAt,
		AssetAvailable: r.assetAvailable,
		Asset:          r.asset,
		CheckedAt:      formatCheckedAt(r.checkedAt),
	}
}
