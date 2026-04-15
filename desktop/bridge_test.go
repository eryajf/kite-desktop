package main

import (
	"testing"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestBuildAIChatBoxURL(t *testing.T) {
	originalBase := common.Base
	t.Cleanup(func() {
		common.Base = originalBase
	})
	common.Base = "/kite"

	bridge, err := newDesktopBridge(&application.App{}, "http://127.0.0.1:34567", nil)
	if err != nil {
		t.Fatalf("newDesktopBridge() error = %v", err)
	}

	got := bridge.buildAIChatBoxURL(aiChatSidecarRequest{
		PageContext: aiChatPageContextRequest{
			Page:         "deployment-detail",
			Namespace:    "default",
			ResourceName: "nginx",
			ResourceKind: "deployment",
		},
		SessionID: "session-1",
	})

	want := "http://127.0.0.1:34567/kite/ai-chat-box?namespace=default&page=deployment-detail&resourceKind=deployment&resourceName=nginx&sessionId=session-1"
	if got != want {
		t.Fatalf("buildAIChatBoxURL() = %q, want %q", got, want)
	}
}
