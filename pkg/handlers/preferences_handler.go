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
