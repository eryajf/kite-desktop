package ai

import (
	"testing"

	"github.com/eryajf/kite-desktop/pkg/model"
)

func TestNormalizeProvider(t *testing.T) {
	if got := normalizeProvider(" Anthropic "); got != model.GeneralAIProviderAnthropic {
		t.Fatalf("expected anthropic, got %q", got)
	}
	if got := normalizeProvider("anything else"); got != model.GeneralAIProviderOpenAI {
		t.Fatalf("expected openai fallback, got %q", got)
	}
}

func TestProviderLabel(t *testing.T) {
	if got := providerLabel(model.GeneralAIProviderAnthropic); got != "Anthropic" {
		t.Fatalf("unexpected label: %q", got)
	}
	if got := providerLabel(model.GeneralAIProviderOpenAI); got != "OpenAI" {
		t.Fatalf("unexpected label: %q", got)
	}
}

func TestIsOpenRouterBaseURL(t *testing.T) {
	if !isOpenRouterBaseURL("https://openrouter.ai/api/v1") {
		t.Fatalf("expected openrouter URL to match")
	}
	if isOpenRouterBaseURL("https://api.openai.com/v1") {
		t.Fatalf("expected non-openrouter URL to not match")
	}
}
