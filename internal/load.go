package internal

import (
	"os"
	"path/filepath"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/model"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
	"k8s.io/klog/v2"
)

func loadUser() error {
	_, err := model.EnsureLocalDesktopUser()
	return err
}

func loadClusters() error {
	cc, err := model.CountClusters()
	if err != nil || cc > 0 {
		return err
	}
	kubeconfigpath := ""
	if home := homedir.HomeDir(); home != "" {
		kubeconfigpath = filepath.Join(home, ".kube", "config")
	}

	if envKubeconfig := os.Getenv("KUBECONFIG"); envKubeconfig != "" {
		kubeconfigpath = envKubeconfig
	}

	config, _ := os.ReadFile(kubeconfigpath)

	if len(config) == 0 {
		return nil
	}
	kubeconfig, err := clientcmd.Load(config)
	if err != nil {
		return err
	}

	klog.Infof("Importing clusters from kubeconfig: %s", kubeconfigpath)
	cluster.ImportClustersFromKubeconfig(kubeconfig)
	return nil
}

// LoadConfigFromEnv loads configuration from environment variables.
func LoadConfigFromEnv() {
	if err := loadUser(); err != nil {
		klog.Warningf("Failed to migrate env to db user: %v", err)
	}

	if err := loadClusters(); err != nil {
		klog.Warningf("Failed to migrate env to db cluster: %v", err)
	}
}
