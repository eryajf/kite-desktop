package internal

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/model"
)

func TestMain(m *testing.M) {
	tempDir, err := os.MkdirTemp("", "kite-internal-tests-*")
	if err != nil {
		panic(err)
	}

	common.DBType = "sqlite"
	common.DBDSN = filepath.Join(tempDir, "internal-test.db")
	model.InitDB()

	exitCode := m.Run()
	if err := os.RemoveAll(tempDir); err != nil {
		fmt.Fprintf(os.Stderr, "cleanup temp dir %q failed: %v\n", tempDir, err)
		if exitCode == 0 {
			exitCode = 1
		}
	}

	os.Exit(exitCode)
}

func TestLoadUserCreatesLocalDesktopUser(t *testing.T) {
	setupLoadTestDB(t)

	if err := loadUser(); err != nil {
		t.Fatalf("loadUser() error = %v", err)
	}

	user, err := model.GetUserByUsername(model.LocalDesktopUser.Username)
	if err != nil {
		t.Fatalf("GetUserByUsername() error = %v", err)
	}
	if user.Provider != model.LocalDesktopUser.Provider {
		t.Fatalf("Provider = %q, want %q", user.Provider, model.LocalDesktopUser.Provider)
	}
	if user.Name != model.LocalDesktopUser.Name {
		t.Fatalf("Name = %q, want %q", user.Name, model.LocalDesktopUser.Name)
	}
}

func TestLoadUserIsIdempotent(t *testing.T) {
	setupLoadTestDB(t)

	if err := loadUser(); err != nil {
		t.Fatalf("first loadUser() error = %v", err)
	}
	if err := loadUser(); err != nil {
		t.Fatalf("second loadUser() error = %v", err)
	}

	count, err := model.CountUsers()
	if err != nil {
		t.Fatalf("CountUsers() error = %v", err)
	}
	if count != 1 {
		t.Fatalf("CountUsers() = %d, want 1", count)
	}
}

func TestLoadClustersSkipsWhenClustersExist(t *testing.T) {
	setupLoadTestDB(t)

	if err := model.AddCluster(&model.Cluster{
		Name:      "existing",
		Config:    model.SecretString("apiVersion: v1"),
		IsDefault: true,
		Enable:    true,
	}); err != nil {
		t.Fatalf("AddCluster() error = %v", err)
	}

	if err := loadClusters(); err != nil {
		t.Fatalf("loadClusters() error = %v", err)
	}

	count, err := model.CountClusters()
	if err != nil {
		t.Fatalf("CountClusters() error = %v", err)
	}
	if count != 1 {
		t.Fatalf("CountClusters() = %d, want 1", count)
	}
}

func TestLoadClustersImportsFromKubeconfig(t *testing.T) {
	setupLoadTestDB(t)

	dir := t.TempDir()
	kubeconfigPath := filepath.Join(dir, "config")
	if err := os.WriteFile(kubeconfigPath, []byte(validKubeconfig), 0o600); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	t.Setenv("KUBECONFIG", kubeconfigPath)

	if err := loadClusters(); err != nil {
		t.Fatalf("loadClusters() error = %v", err)
	}

	cluster, err := model.GetClusterByName("dev")
	if err != nil {
		t.Fatalf("GetClusterByName() error = %v", err)
	}
	if !cluster.IsDefault {
		t.Fatal("expected imported cluster to be default")
	}
}

func TestLoadClustersReturnsLoadError(t *testing.T) {
	setupLoadTestDB(t)

	dir := t.TempDir()
	kubeconfigPath := filepath.Join(dir, "config")
	if err := os.WriteFile(kubeconfigPath, []byte("not: [valid"), 0o600); err != nil {
		t.Fatalf("os.WriteFile() error = %v", err)
	}
	t.Setenv("KUBECONFIG", kubeconfigPath)

	if err := loadClusters(); err == nil {
		t.Fatal("expected loadClusters() to return error")
	}
}

const validKubeconfig = `apiVersion: v1
kind: Config
current-context: dev
clusters:
- name: dev
  cluster:
    server: https://example.com
contexts:
- name: dev
  context:
    cluster: dev
    user: dev
users:
- name: dev
  user:
    token: test-token
`

func setupLoadTestDB(t *testing.T) {
	t.Helper()

	for _, stmt := range []string{
		"DELETE FROM resource_histories",
		"DELETE FROM clusters",
		"DELETE FROM users",
	} {
		if err := model.DB.Exec(stmt).Error; err != nil {
			t.Fatalf("reset test db with %q failed: %v", stmt, err)
		}
	}
}
