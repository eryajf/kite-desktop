package server

import (
	"net/http"

	"github.com/eryajf/kite-desktop/pkg/ai"
	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/handlers"
	"github.com/eryajf/kite-desktop/pkg/handlers/resources"
	"github.com/eryajf/kite-desktop/pkg/middleware"
	"github.com/eryajf/kite-desktop/pkg/version"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"
)

func setupAPIRouter(r *gin.RouterGroup, cm *cluster.ClusterManager) {
	registerBaseRoutes(r)
	registerDesktopPreferenceRoutes(r)
	registerDesktopSettingRoutes(r)
	registerAdminRoutes(r, cm)
	registerProtectedRoutes(r, cm)
}

func registerBaseRoutes(r *gin.RouterGroup) {
	r.GET("/metrics", gin.WrapH(promhttp.HandlerFor(prometheus.Gatherers{
		prometheus.DefaultGatherer,
		ctrlmetrics.Registry,
	}, promhttp.HandlerOpts{})))
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/api/v1/version", version.GetVersion)
	r.POST("/api/v1/version/check-update", version.CheckUpdate)
}

func registerDesktopPreferenceRoutes(r *gin.RouterGroup) {
	preferenceAPI := r.Group("/api/v1/preferences")
	preferenceAPI.GET("/favorites", handlers.GetFavoriteResources)
	preferenceAPI.POST("/favorites", handlers.SaveFavoriteResource)
	preferenceAPI.POST("/favorites/remove", handlers.RemoveFavoriteResource)
	preferenceAPI.GET("/sidebar", handlers.GetSidebarPreference)
	preferenceAPI.PUT("/sidebar", handlers.SaveSidebarPreference)
}

func registerDesktopSettingRoutes(r *gin.RouterGroup) {
	settingAPI := r.Group("/api/v1/settings")
	settingAPI.GET("/general", ai.HandleGetGeneralSetting)
	settingAPI.PUT("/general", ai.HandleUpdateGeneralSetting)
	settingAPI.POST("/general/models", ai.HandleListGeneralAIModels)
	settingAPI.POST("/general/test", ai.HandleTestGeneralAIConnection)
}

func registerAdminRoutes(r *gin.RouterGroup, cm *cluster.ClusterManager) {
	adminAPI := r.Group("/api/v1/admin")
	adminAPI.POST("/clusters/import", cm.ImportClustersFromKubeconfig)

	clusterAPI := adminAPI.Group("/clusters")
	clusterAPI.POST("/test", cm.TestClusterConnection)
	clusterAPI.GET("/", cm.GetClusterList)
	clusterAPI.POST("/", cm.CreateCluster)
	clusterAPI.PUT("/:id", cm.UpdateCluster)
	clusterAPI.DELETE("/:id", cm.DeleteCluster)

	templateAPI := adminAPI.Group("/templates")
	templateAPI.POST("/", handlers.CreateTemplate)
	templateAPI.PUT("/:id", handlers.UpdateTemplate)
	templateAPI.DELETE("/:id", handlers.DeleteTemplate)
}

func registerProtectedRoutes(r *gin.RouterGroup, cm *cluster.ClusterManager) {
	api := r.Group("/api/v1")
	api.GET("/clusters", cm.GetClusters)
	api.Use(middleware.ClusterMiddleware(cm))

	api.GET("/overview", handlers.GetOverview)

	promHandler := handlers.NewPromHandler()
	api.GET("/prometheus/resource-usage-history", promHandler.GetResourceUsageHistory)
	api.GET("/prometheus/pods/:namespace/:podName/metrics", promHandler.GetPodMetrics)

	logsHandler := handlers.NewLogsHandler()
	api.GET("/logs/:namespace/:podName/ws", logsHandler.HandleLogsWebSocket)

	terminalHandler := handlers.NewTerminalHandler()
	api.GET("/terminal/:namespace/:podName/ws", terminalHandler.HandleTerminalWebSocket)

	nodeTerminalHandler := handlers.NewNodeTerminalHandler()
	api.GET("/node-terminal/:nodeName/ws", nodeTerminalHandler.HandleNodeTerminalWebSocket)

	kubectlTerminalHandler := handlers.NewKubectlTerminalHandler()
	api.GET("/kubectl-terminal/ws", kubectlTerminalHandler.HandleKubectlTerminalWebSocket)

	searchHandler := handlers.NewSearchHandler()
	api.GET("/search", searchHandler.GlobalSearch)

	resourceApplyHandler := handlers.NewResourceApplyHandler()
	api.POST("/resources/apply", resourceApplyHandler.ApplyResource)

	api.GET("/image/tags", handlers.GetImageTags)
	api.GET("/templates", handlers.ListTemplates)

	proxyHandler := handlers.NewProxyHandler()
	proxyHandler.RegisterRoutes(api)

	api.GET("/ai/status", ai.HandleAIStatus)
	api.POST("/ai/chat", ai.HandleChat)
	api.POST("/ai/execute/continue", ai.HandleExecuteContinue)
	api.POST("/ai/input/continue", ai.HandleInputContinue)
	api.GET("/ai/sessions", ai.HandleListSessions)
	api.GET("/ai/sessions/:sessionId", ai.HandleGetSession)
	api.PUT("/ai/sessions/:sessionId", ai.HandleUpsertSession)
	api.DELETE("/ai/sessions/:sessionId", ai.HandleDeleteSession)

	resources.RegisterRoutes(api)
}
