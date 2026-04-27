package ai

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-gonic/gin"
)

func TestHandleListGeneralAIModelsUsesStoredAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupValidationTestDB(t)

	setting, err := model.GetGeneralSetting()
	if err != nil {
		t.Fatalf("GetGeneralSetting() error = %v", err)
	}
	if _, err := model.UpdateGeneralSetting(map[string]interface{}{
		"ai_provider": setting.AIProvider,
		"ai_model":    setting.AIModel,
		"ai_api_key":  model.SecretString("stored-openai-key"),
	}); err != nil {
		t.Fatalf("UpdateGeneralSetting() error = %v", err)
	}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer stored-openai-key" {
			t.Fatalf("Authorization header = %q, want %q", got, "Bearer stored-openai-key")
		}
		if r.URL.Path != "/models" {
			t.Fatalf("request path = %q, want %q", r.URL.Path, "/models")
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"gpt-4o-mini","object":"model","created":0,"owned_by":"system"},{"id":"gpt-4.1","object":"model","created":0,"owned_by":"system"}]}`))
	}))
	defer upstream.Close()

	body := bytes.NewBufferString(`{"aiProvider":"openai","aiBaseUrl":"` + upstream.URL + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/settings/general/models", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	_, router := gin.CreateTestContext(rec)
	router.POST("/settings/general/models", HandleListGeneralAIModels)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp struct {
		Models []string `json:"models"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(resp.Models) != 2 || resp.Models[0] != "gpt-4.1" || resp.Models[1] != "gpt-4o-mini" {
		t.Fatalf("models = %#v, want sorted OpenAI models", resp.Models)
	}
}

func TestHandleTestGeneralAIConnectionWithAnthropic(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupValidationTestDB(t)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("x-api-key"); got != "anthropic-test-key" {
			t.Fatalf("x-api-key header = %q, want %q", got, "anthropic-test-key")
		}
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("request path = %q, want %q", r.URL.Path, "/v1/messages")
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg_123","type":"message","role":"assistant","model":"claude-sonnet-4-5","stop_reason":"end_turn","stop_sequence":"","content":[{"type":"text","text":"hello from claude"}],"usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	defer upstream.Close()

	body := bytes.NewBufferString(`{"aiProvider":"anthropic","aiModel":"claude-sonnet-4-5","aiApiKey":"anthropic-test-key","aiBaseUrl":"` + upstream.URL + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/settings/general/test", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	_, router := gin.CreateTestContext(rec)
	router.POST("/settings/general/test", HandleTestGeneralAIConnection)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp generalAIValidationResult
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if resp.Reply != "hello from claude" {
		t.Fatalf("reply = %q, want %q", resp.Reply, "hello from claude")
	}
}

func setupValidationTestDB(t *testing.T) {
	t.Helper()

	tempDir := t.TempDir()
	common.DBType = "sqlite"
	common.DBDSN = filepath.Join(tempDir, "ai-setup-validation.db")
	model.InitDB()

	t.Cleanup(func() {
		_ = os.RemoveAll(tempDir)
	})
}
