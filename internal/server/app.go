package server

import (
	"github.com/eryajf/kite-desktop/internal"
	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/handlers"
	"github.com/eryajf/kite-desktop/pkg/middleware"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"k8s.io/klog/v2"
)

func InitializeApp() (*cluster.ClusterManager, error) {
	common.LoadEnvs()
	if klog.V(1).Enabled() {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	model.InitDB()
	if _, err := model.GetGeneralSetting(); err != nil {
		klog.Warningf("Failed to load general setting: %v", err)
	}

	handlers.InitTemplates()
	internal.LoadConfigFromEnv()

	return cluster.NewClusterManager()
}

func BuildEngine(cm *cluster.ClusterManager) *gin.Engine {
	r := gin.New()
	r.Use(middleware.Metrics())
	if !common.DisableGZIP {
		klog.Info("GZIP compression is enabled")
		r.Use(gzip.Gzip(gzip.DefaultCompression, gzip.WithExcludedPaths([]string{"/metrics"})))
	}
	r.Use(gin.Recovery())
	r.Use(middleware.Logger())
	r.Use(middleware.DevCORS(common.CORSAllowedOrigins))

	base := r.Group(common.Base)
	setupAPIRouter(base, cm)
	setupStatic(r)

	return r
}
