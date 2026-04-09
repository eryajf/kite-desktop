package server

import (
	"context"
	"net/http"
	"time"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/gin-gonic/gin"
)

type Runtime struct {
	ClusterManager *cluster.ClusterManager
	Engine         *gin.Engine
	Server         *http.Server
}

func NewRuntime(addr string) (*Runtime, error) {
	cm, err := InitializeApp()
	if err != nil {
		return nil, err
	}

	if addr == "" {
		addr = ":" + common.Port
	}

	engine := BuildEngine(cm)

	return &Runtime{
		ClusterManager: cm,
		Engine:         engine,
		Server: &http.Server{
			Addr:              addr,
			Handler:           engine.Handler(),
			ReadHeaderTimeout: 10 * time.Second,
			IdleTimeout:       120 * time.Second,
		},
	}, nil
}

func (r *Runtime) Start() error {
	return r.Server.ListenAndServe()
}

func (r *Runtime) Shutdown(ctx context.Context) error {
	return r.Server.Shutdown(ctx)
}
