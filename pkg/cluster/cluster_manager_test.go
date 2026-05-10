package cluster

import (
	"strings"
	"testing"
	"time"

	"github.com/eryajf/kite-desktop/pkg/kube"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
	"k8s.io/client-go/kubernetes"
)

func Test_shouldUpdateCluster(t *testing.T) {
	type args struct {
		cs      *ClientSet
		cluster *model.Cluster
	}
	tests := []struct {
		name string
		args args
		want bool
	}{
		{
			name: "enable/disable toggle, disable -> enable",
			args: args{
				cs:      nil,
				cluster: &model.Cluster{Name: "test", Enable: true},
			},
			want: true,
		},
		{
			name: "enable/disable toggle, enable -> disable",
			args: args{
				cs: &ClientSet{
					Name: "test",
				},
				cluster: &model.Cluster{Name: "test", Enable: false},
			},
			want: true,
		},
		{
			name: "disable cluster, keep disable",
			args: args{
				cs:      nil,
				cluster: &model.Cluster{Name: "test", Enable: false},
			},
			want: false,
		},
		{
			name: "invalid ClientSet(nil k8sClient), need update",
			args: args{
				cs: &ClientSet{
					Name:      "test",
					Version:   "v1.34.0",
					K8sClient: nil,
				},
				cluster: &model.Cluster{Name: "test", Enable: true},
			},
			want: true,
		},
		{
			name: "invalid ClientSet(nil k8sClient.ClientSet), need update",
			args: args{
				cs: &ClientSet{
					Name:    "test",
					Version: "v1.34.0",
					K8sClient: &kube.K8sClient{
						ClientSet: nil,
					},
				},
				cluster: &model.Cluster{Name: "test", Enable: true},
			},
			want: true,
		},
		{
			name: "k8s config change, need update",
			args: args{
				cs: &ClientSet{
					Name:    "test",
					Version: "v1.34.0",
					K8sClient: &kube.K8sClient{
						ClientSet: &kubernetes.Clientset{},
					},
					config: "test-config",
				},
				cluster: &model.Cluster{Name: "test", Enable: true, Config: model.SecretString("test-config-new")},
			},
			want: true,
		},
		{
			name: "prometheus url change, need update",
			args: args{
				cs: &ClientSet{
					Name:    "test",
					Version: "v1.34.0",
					K8sClient: &kube.K8sClient{
						ClientSet: &kubernetes.Clientset{},
					},
					prometheusURL: "test-prometheus-url",
				},
				cluster: &model.Cluster{Name: "test", Enable: true, PrometheusURL: "test-prometheus-url-new"},
			},
			want: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldUpdateCluster(tt.args.cs, tt.args.cluster); got != tt.want {
				t.Errorf("shouldUpdateCluster() = %v, want %v", got, tt.want)
			}
		})
	}

	t.Run("k8s version change, need update", func(t *testing.T) {
		restore := stubServerVersionFetcher(func(_ *kube.K8sClient) (string, error) {
			return "v1.34.0", nil
		})
		defer restore()

		cs := &ClientSet{
			Name:    "test",
			Version: "v1.33.0",
			K8sClient: &kube.K8sClient{
				ClientSet: &kubernetes.Clientset{},
			},
		}
		cluster := &model.Cluster{Name: "test", Enable: true}

		got := shouldUpdateCluster(cs, cluster)
		assert.True(t, got, "expected update when k8s version changed")
	})

	t.Run("same, skip update", func(t *testing.T) {
		restore := stubServerVersionFetcher(func(_ *kube.K8sClient) (string, error) {
			return "v1.34.0", nil
		})
		defer restore()

		cs := &ClientSet{
			Name:    "test",
			Version: "v1.34.0",
			K8sClient: &kube.K8sClient{
				ClientSet: &kubernetes.Clientset{},
			},
			config:        "test-config",
			prometheusURL: "test-prometheus-url",
		}
		cluster := &model.Cluster{
			Name:          "test",
			Enable:        true,
			Config:        model.SecretString("test-config"),
			PrometheusURL: "test-prometheus-url",
		}
		got := shouldUpdateCluster(cs, cluster)
		assert.False(t, got, "expected no update when all the same")
	})
}

func TestSyncClustersDoesNotBlockOnStalledClusterBuild(t *testing.T) {
	restoreDB := useClusterManagerTestDB(t)
	defer restoreDB()

	if err := model.AddCluster(&model.Cluster{Name: "healthy", Enable: true}); err != nil {
		t.Fatalf("add healthy cluster: %v", err)
	}
	if err := model.AddCluster(&model.Cluster{Name: "stalled", Enable: true}); err != nil {
		t.Fatalf("add stalled cluster: %v", err)
	}

	originalBuilder := createClientSetFromConfigFunc
	originalTimeout := clusterBuildTimeout
	t.Cleanup(func() {
		createClientSetFromConfigFunc = originalBuilder
		clusterBuildTimeout = originalTimeout
	})
	clusterBuildTimeout = 20 * time.Millisecond
	createClientSetFromConfigFunc = func(name, content, prometheusURL string) (*ClientSet, error) {
		if name == "stalled" {
			select {}
		}
		return &ClientSet{
			Name:      name,
			Version:   "v1.30.0",
			K8sClient: &kube.K8sClient{ClientSet: &kubernetes.Clientset{}},
		}, nil
	}

	cm := &ClusterManager{
		clusters: make(map[string]*ClientSet),
		errors:   make(map[string]string),
	}

	start := time.Now()
	if err := syncClusters(cm); err != nil {
		t.Fatalf("syncClusters error = %v", err)
	}
	if elapsed := time.Since(start); elapsed > 250*time.Millisecond {
		t.Fatalf("syncClusters blocked for %s", elapsed)
	}
	if _, ok := cm.clusters["healthy"]; !ok {
		t.Fatalf("healthy cluster was not loaded: %#v", cm.clusters)
	}
	stalledError := cm.errors["stalled"]
	if !strings.Contains(stalledError, "timed out") {
		t.Fatalf("stalled cluster error = %q, want timeout message", stalledError)
	}
}

func TestSyncClustersRetriesClusterAfterPreviousBuildError(t *testing.T) {
	restoreDB := useClusterManagerTestDB(t)
	defer restoreDB()

	if err := model.AddCluster(&model.Cluster{Name: "recovering", Enable: true}); err != nil {
		t.Fatalf("add recovering cluster: %v", err)
	}

	originalBuilder := createClientSetFromConfigFunc
	t.Cleanup(func() {
		createClientSetFromConfigFunc = originalBuilder
	})
	buildAttempts := 0
	createClientSetFromConfigFunc = func(name, content, prometheusURL string) (*ClientSet, error) {
		buildAttempts++
		if buildAttempts == 1 {
			return nil, assert.AnError
		}
		return &ClientSet{
			Name:      name,
			Version:   "v1.31.0",
			K8sClient: &kube.K8sClient{ClientSet: &kubernetes.Clientset{}},
		}, nil
	}

	cm := &ClusterManager{
		clusters: make(map[string]*ClientSet),
		errors:   make(map[string]string),
	}

	if err := syncClusters(cm); err != nil {
		t.Fatalf("first syncClusters error = %v", err)
	}
	if _, ok := cm.errors["recovering"]; !ok {
		t.Fatalf("expected recovering cluster to have initial error: %#v", cm.errors)
	}

	if err := syncClusters(cm); err != nil {
		t.Fatalf("second syncClusters error = %v", err)
	}
	if _, ok := cm.errors["recovering"]; ok {
		t.Fatalf("expected recovering cluster error to be cleared: %#v", cm.errors)
	}
	if got := cm.clusters["recovering"]; got == nil || got.Version != "v1.31.0" {
		t.Fatalf("recovering cluster was not rebuilt: %#v", cm.clusters["recovering"])
	}
	if buildAttempts != 2 {
		t.Fatalf("buildAttempts = %d, want 2", buildAttempts)
	}
}

func useClusterManagerTestDB(t *testing.T) func() {
	t.Helper()

	originalDB := model.DB
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}

	model.DB = db
	if err := model.DB.AutoMigrate(&model.Cluster{}); err != nil {
		t.Fatalf("migrate cluster model: %v", err)
	}

	return func() {
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
		model.DB = originalDB
	}
}
