package server

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/version"
	"k8s.io/klog/v2"
)

func RunUntilSignal(pprofAddr string) error {
	if pprofAddr != "" {
		go func() {
			log.Println(http.ListenAndServe(pprofAddr, nil))
		}()
	}

	runtime, err := NewRuntime("")
	if err != nil {
		return err
	}

	go func() {
		if err := runtime.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			klog.Fatalf("Failed to start server: %v", err)
		}
	}()

	klog.Infof("Kite server started on port %s", common.Port)
	klog.Infof("Version: %s, Build Date: %s, Commit: %s",
		version.Version, version.BuildDate, version.CommitID)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	klog.Info("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return runtime.Shutdown(ctx)
}
