package kube

import (
	"net/url"

	"k8s.io/apimachinery/pkg/util/httpstream"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

var (
	newSPDYExecutor      = remotecommand.NewSPDYExecutor
	newWebSocketExecutor = remotecommand.NewWebSocketExecutor
	newFallbackExecutor  = remotecommand.NewFallbackExecutor
)

func newRemoteCommandExecutor(config *rest.Config, targetURL *url.URL) (remotecommand.Executor, error) {
	spdyExec, err := newSPDYExecutor(config, "POST", targetURL)
	if err != nil {
		return nil, err
	}

	websocketExec, err := newWebSocketExecutor(config, "GET", targetURL.String())
	if err != nil {
		return nil, err
	}

	return newFallbackExecutor(websocketExec, spdyExec, func(err error) bool {
		return httpstream.IsUpgradeFailure(err) || httpstream.IsHTTPSProxyError(err)
	})
}
