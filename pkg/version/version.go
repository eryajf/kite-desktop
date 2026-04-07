package version

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/common"
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
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasNew         bool   `json:"hasNewVersion"`
	Release        string `json:"releaseUrl"`
	CheckedAt      string `json:"checkedAt"`
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
			versionInfo.HasNew = r.hasNew
			if versionInfo.HasNew {
				versionInfo.Release = r.releaseURL
			}
		}
	}
	c.JSON(http.StatusOK, versionInfo)
}

func CheckUpdate(c *gin.Context) {
	var req UpdateCheckRequest
	if err := c.ShouldBindJSON(&req); err != nil && err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid update-check payload"})
		return
	}

	result, err := checkForUpdate(c.Request.Context(), Version, req.Force)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, UpdateCheckInfo{
		CurrentVersion: strings.TrimPrefix(Version, "v"),
		LatestVersion:  strings.TrimPrefix(result.latestVersion, "v"),
		HasNew:         result.hasNew,
		Release:        result.releaseURL,
		CheckedAt:      formatCheckedAt(result.checkedAt),
	})
}

func formatCheckedAt(checkedAt time.Time) string {
	if checkedAt.IsZero() {
		return ""
	}
	return checkedAt.Format(time.RFC3339)
}
