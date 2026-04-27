package ai

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	anthropicoption "github.com/anthropics/anthropic-sdk-go/option"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-gonic/gin"
	"github.com/openai/openai-go"
	openaioption "github.com/openai/openai-go/option"
)

const generalAIValidationTimeout = 15 * time.Second
const generalAIValidationPrompt = "hi"

type generalAIValidationRequest struct {
	AIProvider *string `json:"aiProvider"`
	AIModel    *string `json:"aiModel"`
	AIAPIKey   *string `json:"aiApiKey"`
	AIBaseURL  *string `json:"aiBaseUrl"`
}

type generalAIValidationResult struct {
	Message string `json:"message"`
	Reply   string `json:"reply,omitempty"`
}

func HandleListGeneralAIModels(c *gin.Context) {
	var req generalAIValidationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request: %v", err)})
		return
	}

	cfg, err := buildValidationRuntimeConfig(req, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), generalAIValidationTimeout)
	defer cancel()

	models, err := fetchProviderModels(ctx, cfg)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("Failed to fetch models: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"models": models})
}

func HandleTestGeneralAIConnection(c *gin.Context) {
	var req generalAIValidationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request: %v", err)})
		return
	}

	cfg, err := buildValidationRuntimeConfig(req, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), generalAIValidationTimeout)
	defer cancel()

	result, err := testProviderConnection(ctx, cfg)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("Connection test failed: %v", err)})
		return
	}

	c.JSON(http.StatusOK, result)
}

func buildValidationRuntimeConfig(
	req generalAIValidationRequest,
	requireModel bool,
) (*RuntimeConfig, error) {
	currentSetting, err := model.GetGeneralSetting()
	if err != nil {
		return nil, fmt.Errorf("failed to load general setting: %w", err)
	}

	provider := currentSetting.AIProvider
	if req.AIProvider != nil {
		provider = strings.TrimSpace(*req.AIProvider)
	}
	if !model.IsGeneralAIProviderSupported(provider) {
		return nil, fmt.Errorf("unsupported aiProvider")
	}
	provider = normalizeProvider(provider)

	modelName := strings.TrimSpace(currentSetting.AIModel)
	if req.AIModel != nil {
		modelName = strings.TrimSpace(*req.AIModel)
	}
	if modelName == "" {
		modelName = defaultModelForProvider(provider)
	}
	if requireModel && modelName == "" {
		return nil, fmt.Errorf("model is required")
	}

	apiKey := strings.TrimSpace(string(currentSetting.AIAPIKey))
	if req.AIAPIKey != nil {
		apiKey = strings.TrimSpace(*req.AIAPIKey)
	}
	if apiKey == "" {
		return nil, fmt.Errorf("apiKey is required")
	}

	baseURL := strings.TrimSpace(currentSetting.AIBaseURL)
	if req.AIBaseURL != nil {
		baseURL = strings.TrimSpace(*req.AIBaseURL)
	}

	maxTokens := currentSetting.AIMaxTokens
	if maxTokens <= 0 {
		maxTokens = 256
	}

	return &RuntimeConfig{
		Enabled:   true,
		Provider:  provider,
		Model:     modelName,
		APIKey:    apiKey,
		BaseURL:   baseURL,
		MaxTokens: maxTokens,
	}, nil
}

func fetchProviderModels(ctx context.Context, cfg *RuntimeConfig) ([]string, error) {
	switch normalizeProvider(cfg.Provider) {
	case model.GeneralAIProviderAnthropic:
		return fetchAnthropicModels(ctx, cfg)
	default:
		return fetchOpenAIModels(ctx, cfg)
	}
}

func fetchOpenAIModels(ctx context.Context, cfg *RuntimeConfig) ([]string, error) {
	client, err := NewOpenAIClientWithOptions(cfg, openaioption.WithMaxRetries(0))
	if err != nil {
		return nil, err
	}

	page, err := client.Models.List(ctx)
	if err != nil {
		return nil, err
	}

	models := make([]string, 0, len(page.Data))
	for _, item := range page.Data {
		models = appendUniqueModel(models, item.ID)
	}

	return finalizeFetchedModels(models)
}

func fetchAnthropicModels(ctx context.Context, cfg *RuntimeConfig) ([]string, error) {
	client, err := NewAnthropicClientWithOptions(cfg, anthropicoption.WithMaxRetries(0))
	if err != nil {
		return nil, err
	}

	page, err := client.Models.List(ctx, anthropic.ModelListParams{
		Limit: anthropic.Int(1000),
	})
	if err != nil {
		return nil, err
	}

	models := make([]string, 0, len(page.Data))
	for _, item := range page.Data {
		models = appendUniqueModel(models, item.ID)
	}

	return finalizeFetchedModels(models)
}

func testProviderConnection(ctx context.Context, cfg *RuntimeConfig) (*generalAIValidationResult, error) {
	switch normalizeProvider(cfg.Provider) {
	case model.GeneralAIProviderAnthropic:
		return testAnthropicConnection(ctx, cfg)
	default:
		return testOpenAIConnection(ctx, cfg)
	}
}

func testOpenAIConnection(ctx context.Context, cfg *RuntimeConfig) (*generalAIValidationResult, error) {
	client, err := NewOpenAIClientWithOptions(cfg, openaioption.WithMaxRetries(0))
	if err != nil {
		return nil, err
	}

	stream := client.Chat.Completions.NewStreaming(ctx, openai.ChatCompletionNewParams{
		Model: cfg.Model,
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage(generalAIValidationPrompt),
		},
		MaxCompletionTokens: openai.Int(128),
	})

	reply, refusal, _, _, err := consumeStreamingResponse(stream, func(SSEEvent) {})
	if err != nil {
		return nil, err
	}

	reply = strings.TrimSpace(reply)
	if reply == "" {
		reply = strings.TrimSpace(refusal)
	}
	if reply != "" {
		return &generalAIValidationResult{
			Message: "Connection test succeeded.",
			Reply:   reply,
		}, nil
	}

	return nil, fmt.Errorf("model returned no content")
}

func testAnthropicConnection(ctx context.Context, cfg *RuntimeConfig) (*generalAIValidationResult, error) {
	client, err := NewAnthropicClientWithOptions(cfg, anthropicoption.WithMaxRetries(0))
	if err != nil {
		return nil, err
	}

	resp, err := client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     cfg.Model,
		MaxTokens: 128,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(generalAIValidationPrompt)),
		},
	})
	if err != nil {
		return nil, err
	}

	var replyParts []string
	for _, block := range resp.Content {
		if strings.EqualFold(block.Type, "text") {
			text := strings.TrimSpace(block.Text)
			if text != "" {
				replyParts = append(replyParts, text)
			}
		}
	}

	reply := strings.TrimSpace(strings.Join(replyParts, "\n"))
	if reply == "" {
		return nil, fmt.Errorf("model returned no content")
	}

	return &generalAIValidationResult{
		Message: "Connection test succeeded.",
		Reply:   reply,
	}, nil
}

func appendUniqueModel(models []string, candidate string) []string {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return models
	}
	for _, item := range models {
		if item == candidate {
			return models
		}
	}
	return append(models, candidate)
}

func finalizeFetchedModels(models []string) ([]string, error) {
	if len(models) == 0 {
		return nil, fmt.Errorf("no models returned")
	}

	sort.Strings(models)
	return models, nil
}
