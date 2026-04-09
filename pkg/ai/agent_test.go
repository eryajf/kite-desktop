package ai

import (
	"strings"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/cluster"
)

func TestNormalizeChatMessages(t *testing.T) {
	longContent := strings.Repeat("a", maxMessageChars+10)
	messages := make([]ChatMessage, 0, maxConversationMessages+2)
	messages = append(messages, ChatMessage{Role: "user", Content: "   "})
	for i := 0; i < maxConversationMessages+1; i++ {
		content := "  hello  "
		if i == maxConversationMessages {
			content = longContent
		}
		role := "user"
		if i%2 == 0 {
			role = "assistant"
		}
		messages = append(messages, ChatMessage{Role: role, Content: content})
	}

	normalized := normalizeChatMessages(messages)
	if len(normalized) != maxConversationMessages {
		t.Fatalf("expected %d messages, got %d", maxConversationMessages, len(normalized))
	}
	if normalized[0].Content != "hello" {
		t.Fatalf("expected trimmed content, got %q", normalized[0].Content)
	}
	if normalized[0].Role != "user" && normalized[0].Role != "assistant" {
		t.Fatalf("unexpected role: %s", normalized[0].Role)
	}
	if len(normalized[len(normalized)-1].Content) != maxMessageChars {
		t.Fatalf("expected truncated message length %d, got %d", maxMessageChars, len(normalized[len(normalized)-1].Content))
	}
}

func TestBuildRuntimePromptContext(t *testing.T) {
	ctx := buildRuntimePromptContext(&cluster.ClientSet{Name: "cluster-a"})
	if ctx.ClusterName != "cluster-a" {
		t.Fatalf("expected cluster-a, got %q", ctx.ClusterName)
	}
}

func TestBuildContextualSystemPrompt(t *testing.T) {
	prompt := buildContextualSystemPrompt(
		&PageContext{Page: "pod-detail", Namespace: "default", ResourceKind: "Pod", ResourceName: "nginx"},
		runtimePromptContext{ClusterName: "cluster-a"},
		"zh",
	)

	checks := []string{
		"Current runtime context:",
		"Current cluster: cluster-a",
		"Current page context:",
		"Current resource: Pod/nginx",
		"Current namespace: default",
		"Focus on this pod's status, logs, events, and health. Proactively check for issues.",
		"Response language:",
		"respond in Simplified Chinese unless the user explicitly asks for another language.",
	}
	for _, want := range checks {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt missing %q", want)
		}
	}
}

func TestParseToolCallArguments(t *testing.T) {
	args, err := parseToolCallArguments(`{"name":"nginx","replicas":3}`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if args["name"] != "nginx" {
		t.Fatalf("unexpected name: %#v", args["name"])
	}
	if args["replicas"].(float64) != 3 {
		t.Fatalf("unexpected replicas: %#v", args["replicas"])
	}

	empty, err := parseToolCallArguments("  ")
	if err != nil {
		t.Fatalf("unexpected error for empty input: %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("expected empty args, got %#v", empty)
	}
}

func TestMarshalSSEEvent(t *testing.T) {
	got := MarshalSSEEvent(SSEEvent{Event: "message", Data: map[string]string{"content": "hello"}})
	want := "event: message\ndata: {\"content\":\"hello\"}\n\n"
	if got != want {
		t.Fatalf("unexpected SSE output:\nwant: %q\ngot:  %q", want, got)
	}
}
