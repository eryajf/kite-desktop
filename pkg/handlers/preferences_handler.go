package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/model"
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
