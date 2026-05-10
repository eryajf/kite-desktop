package kube

import (
	"context"
	"errors"
	"net/url"
	"testing"

	"k8s.io/apimachinery/pkg/util/httpstream"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

type stubExecutor struct {
	streamWithContext func(ctx context.Context, options remotecommand.StreamOptions) error
}

func (s stubExecutor) Stream(options remotecommand.StreamOptions) error {
	return s.StreamWithContext(context.Background(), options)
}

func (s stubExecutor) StreamWithContext(ctx context.Context, options remotecommand.StreamOptions) error {
	if s.streamWithContext != nil {
		return s.streamWithContext(ctx, options)
	}
	return nil
}

func TestNewRemoteCommandExecutor_UsesWebSocketThenSPDYFallback(t *testing.T) {
	oldNewSPDYExecutor := newSPDYExecutor
	oldNewWebSocketExecutor := newWebSocketExecutor
	oldNewFallbackExecutor := newFallbackExecutor
	defer func() {
		newSPDYExecutor = oldNewSPDYExecutor
		newWebSocketExecutor = oldNewWebSocketExecutor
		newFallbackExecutor = oldNewFallbackExecutor
	}()

	var gotSPDYMethod string
	var gotSPDYURL *url.URL
	spdyExec := &stubExecutor{}
	newSPDYExecutor = func(config *rest.Config, method string, targetURL *url.URL) (remotecommand.Executor, error) {
		gotSPDYMethod = method
		gotSPDYURL = targetURL
		return spdyExec, nil
	}

	var gotWSMethod string
	var gotWSURL string
	wsExec := &stubExecutor{}
	newWebSocketExecutor = func(config *rest.Config, method, targetURL string) (remotecommand.Executor, error) {
		gotWSMethod = method
		gotWSURL = targetURL
		return wsExec, nil
	}

	var gotPrimary, gotSecondary remotecommand.Executor
	newFallbackExecutor = func(primary, secondary remotecommand.Executor, shouldFallback func(error) bool) (remotecommand.Executor, error) {
		gotPrimary = primary
		gotSecondary = secondary
		if !shouldFallback(&httpstream.UpgradeFailureError{Cause: errors.New("upgrade failed")}) {
			t.Fatalf("expected fallback predicate to accept upgrade failure")
		}
		return &stubExecutor{}, nil
	}

	targetURL, err := url.Parse("https://cluster.example/api/v1/namespaces/default/pods/nginx/exec")
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	exec, err := newRemoteCommandExecutor(&rest.Config{}, targetURL)
	if err != nil {
		t.Fatalf("newRemoteCommandExecutor() error = %v", err)
	}

	if exec == nil {
		t.Fatal("newRemoteCommandExecutor() returned nil executor")
	}
	if gotSPDYMethod != "POST" {
		t.Fatalf("SPDY method = %q, want POST", gotSPDYMethod)
	}
	if gotSPDYURL == nil || gotSPDYURL.String() != targetURL.String() {
		t.Fatalf("SPDY url = %v, want %v", gotSPDYURL, targetURL)
	}
	if gotWSMethod != "GET" {
		t.Fatalf("WebSocket method = %q, want GET", gotWSMethod)
	}
	if gotWSURL != targetURL.String() {
		t.Fatalf("WebSocket url = %q, want %q", gotWSURL, targetURL.String())
	}
	if gotPrimary != wsExec {
		t.Fatalf("primary executor = %#v, want websocket executor", gotPrimary)
	}
	if gotSecondary != spdyExec {
		t.Fatalf("secondary executor = %#v, want spdy executor", gotSecondary)
	}
}
