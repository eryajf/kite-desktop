package handlers

import (
	"net/http"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/kube"
	"github.com/gin-gonic/gin"
)

type ProxyHandler struct{}

func NewProxyHandler() *ProxyHandler {
	return &ProxyHandler{}
}

func (h *ProxyHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("/namespaces/:namespace/:kind/:name/proxy/*path", h.HandleProxy)
}

func (h *ProxyHandler) HandleProxy(c *gin.Context) {
	cs := c.MustGet("cluster").(*cluster.ClientSet)
	kind := c.Param("kind")
	if kind != "pods" && kind != "services" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid kind, must be 'pods' or 'services'"})
		return
	}
	name := c.Param("name")
	namespace := c.Param("namespace")
	kube.HandleProxy(c, cs.K8sClient, kind, namespace, name, c.Param("path"))
}
