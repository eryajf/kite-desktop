package ai

import (
	"fmt"
	"strings"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	anthropicoption "github.com/anthropics/anthropic-sdk-go/option"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/openai/openai-go"
	openaioption "github.com/openai/openai-go/option"
)

type RuntimeConfig struct {
	Enabled   bool
	Provider  string
	Model     string
	APIKey    string
	BaseURL   string
	MaxTokens int
}

func normalizeProvider(provider string) string {
	return model.NormalizeGeneralAIProvider(strings.ToLower(strings.TrimSpace(provider)))
}

func defaultModelForProvider(provider string) string {
	return model.DefaultGeneralAIModelByProvider(provider)
}

func isOpenRouterBaseURL(baseURL string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(baseURL)), "openrouter.ai")
}

func providerLabel(provider string) string {
	switch provider {
	case model.GeneralAIProviderAnthropic:
		return "Anthropic"
	default:
		return "OpenAI"
	}
}

func LoadRuntimeConfig() (*RuntimeConfig, error) {
	setting, err := model.GetGeneralSetting()
	if err != nil {
		return nil, err
	}

	cfg := &RuntimeConfig{
		Enabled:   setting.AIAgentEnabled,
		Provider:  normalizeProvider(setting.AIProvider),
		Model:     strings.TrimSpace(setting.AIModel),
		APIKey:    strings.TrimSpace(string(setting.AIAPIKey)),
		BaseURL:   strings.TrimSpace(setting.AIBaseURL),
		MaxTokens: setting.AIMaxTokens,
	}
	if cfg.Model == "" {
		cfg.Model = defaultModelForProvider(cfg.Provider)
	}
	if cfg.MaxTokens <= 0 {
		cfg.MaxTokens = model.DefaultGeneralAIMaxTokens
	}
	if !cfg.Enabled {
		return cfg, nil
	}
	if cfg.APIKey == "" {
		cfg.Enabled = false
	}
	return cfg, nil
}

func buildOpenAIClientOptions(cfg *RuntimeConfig, extraOpts ...openaioption.RequestOption) ([]openaioption.RequestOption, error) {
	if cfg == nil || !cfg.Enabled {
		return nil, fmt.Errorf("AI is not enabled")
	}
	if normalizeProvider(cfg.Provider) != model.GeneralAIProviderOpenAI {
		return nil, fmt.Errorf("AI provider %s is not supported by OpenAI client", providerLabel(cfg.Provider))
	}

	opts := make([]openaioption.RequestOption, 0, 2+len(extraOpts))
	if cfg.APIKey != "" {
		opts = append(opts, openaioption.WithAPIKey(cfg.APIKey))
	}
	if cfg.BaseURL != "" {
		opts = append(opts, openaioption.WithBaseURL(cfg.BaseURL))
		if isOpenRouterBaseURL(cfg.BaseURL) {
			opts = append(opts, openaioption.WithHeader("X-OpenRouter-Title", "OpenClaw"))
		}
	}
	opts = append(opts, extraOpts...)

	return opts, nil
}

func NewOpenAIClient(cfg *RuntimeConfig) (openai.Client, error) {
	opts, err := buildOpenAIClientOptions(cfg)
	if err != nil {
		return openai.Client{}, err
	}

	return openai.NewClient(opts...), nil
}

func NewOpenAIClientWithOptions(cfg *RuntimeConfig, extraOpts ...openaioption.RequestOption) (openai.Client, error) {
	opts, err := buildOpenAIClientOptions(cfg, extraOpts...)
	if err != nil {
		return openai.Client{}, err
	}

	return openai.NewClient(opts...), nil
}

func buildAnthropicClientOptions(cfg *RuntimeConfig, extraOpts ...anthropicoption.RequestOption) ([]anthropicoption.RequestOption, error) {
	if cfg == nil || !cfg.Enabled {
		return nil, fmt.Errorf("AI is not enabled")
	}
	if normalizeProvider(cfg.Provider) != model.GeneralAIProviderAnthropic {
		return nil, fmt.Errorf("AI provider %s is not supported by Anthropic client", providerLabel(cfg.Provider))
	}

	opts := make([]anthropicoption.RequestOption, 0, 2+len(extraOpts))
	if cfg.APIKey != "" {
		opts = append(opts, anthropicoption.WithAuthToken(cfg.APIKey))
		opts = append(opts, anthropicoption.WithAPIKey(cfg.APIKey))
	}
	if cfg.BaseURL != "" {
		opts = append(opts, anthropicoption.WithBaseURL(cfg.BaseURL))
		if isOpenRouterBaseURL(cfg.BaseURL) {
			opts = append(opts, anthropicoption.WithHeader("X-OpenRouter-Title", "OpenClaw"))
		}
	}
	opts = append(opts, extraOpts...)

	return opts, nil
}

func NewAnthropicClient(cfg *RuntimeConfig) (anthropic.Client, error) {
	opts, err := buildAnthropicClientOptions(cfg)
	if err != nil {
		return anthropic.Client{}, err
	}

	return anthropic.NewClient(opts...), nil
}

func NewAnthropicClientWithOptions(cfg *RuntimeConfig, extraOpts ...anthropicoption.RequestOption) (anthropic.Client, error) {
	opts, err := buildAnthropicClientOptions(cfg, extraOpts...)
	if err != nil {
		return anthropic.Client{}, err
	}

	return anthropic.NewClient(opts...), nil
}
