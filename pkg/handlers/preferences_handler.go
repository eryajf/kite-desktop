package handlers

import (
	"net/http"

	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-gonic/gin"
)

func GetSidebarPreference(c *gin.Context) {
	pref, err := model.GetDesktopSidebarPreference()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"sidebar_preference": pref,
	})
}

func GetAppearancePreference(c *gin.Context) {
	pref, err := model.GetDesktopAppearancePreferences()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pref)
}

func SaveSidebarPreference(c *gin.Context) {
	var req struct {
		SidebarPreference string `json:"sidebar_preference" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := model.SaveDesktopSidebarPreference(req.SidebarPreference); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func SaveAppearancePreference(c *gin.Context) {
	var req model.DesktopAppearancePreferences

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := model.SaveDesktopAppearancePreferences(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func GetViewerPreference(c *gin.Context) {
	pref, err := model.GetDesktopViewerPreferences()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pref)
}

func SaveViewerPreference(c *gin.Context) {
	var req model.DesktopViewerPreferences

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := model.SaveDesktopViewerPreferences(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func GetWorkspacePreference(c *gin.Context) {
	pref, err := model.GetDesktopWorkspacePreferences()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pref)
}

func SaveWorkspacePreference(c *gin.Context) {
	var req model.DesktopWorkspacePreferences

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := model.SaveDesktopWorkspacePreferences(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func GetResourceTablePreference(c *gin.Context) {
	pref, err := model.GetDesktopResourceTablePreferences()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pref)
}

func SaveResourceTablePreference(c *gin.Context) {
	var req model.DesktopResourceTablePreferences

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := model.SaveDesktopResourceTablePreferences(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func GetUIPreference(c *gin.Context) {
	pref, err := model.GetDesktopUIPreferences()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, pref)
}

func SaveUIPreference(c *gin.Context) {
	var req model.DesktopUIPreferences

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := model.SaveDesktopUIPreferences(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}
