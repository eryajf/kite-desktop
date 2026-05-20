package kube

import (
	"context"
	"fmt"
	"os"
	"time"

	corev1 "k8s.io/api/core/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	toolscache "k8s.io/client-go/tools/cache"
	"k8s.io/klog/v2"
	"sigs.k8s.io/controller-runtime/pkg/cache"

	metricsv1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
	"sigs.k8s.io/controller-runtime/pkg/client"
	ctrllog "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/manager"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
	gatewayapiv1 "sigs.k8s.io/gateway-api/apis/v1"
)

var runtimeScheme = runtime.NewScheme()

func init() {
	ctrllog.SetLogger(klog.NewKlogr())
	_ = scheme.AddToScheme(runtimeScheme)
	_ = apiextensionsv1.AddToScheme(runtimeScheme)
	_ = gatewayapiv1.Install(runtimeScheme)
	_ = metricsv1.AddToScheme(runtimeScheme)
}

// K8sClient holds the Kubernetes client instances
type K8sClient struct {
	client.Client
	ClientSet          kubernetes.Interface
	StreamingClientSet kubernetes.Interface // For long-running streaming requests (e.g., log follow) without HTTP timeout
	Configuration      *rest.Config
	MetricsClient      *metricsclient.Clientset
	CacheEnabled       bool // true when using controller-runtime informer cache

	cancel context.CancelFunc
}

const cacheSyncTimeout = 20 * time.Second

// NewClient creates a K8sClient from a rest.Config
func NewClient(config *rest.Config) (*K8sClient, error) {
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	// Create a streaming clientset without HTTP timeout for long-running requests like log streaming
	streamingConfig := rest.CopyConfig(config)
	streamingConfig.Timeout = 0
	streamingClientset, err := kubernetes.NewForConfig(streamingConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create streaming clientset: %w", err)
	}

	metricsClient, err := metricsclient.NewForConfig(config)
	if err != nil {
		klog.Warningf("failed to create metrics client: %v", err)
	}

	runCtx, cancel := context.WithCancel(context.Background())
	cacheEnabled := os.Getenv("DISABLE_CACHE") != "true"

	var c client.Client
	if !cacheEnabled {
		c, err = client.New(config, client.Options{
			Scheme: runtimeScheme,
		})
		if err != nil {
			cancel()
			return nil, fmt.Errorf("failed to create client: %w", err)
		}
	} else {
		mgr, err := manager.New(config, manager.Options{
			Scheme:         runtimeScheme,
			LeaderElection: false,
			Metrics: metricsserver.Options{
				BindAddress: "0", // Disable metrics server
			},
			Cache: cache.Options{
				DefaultWatchErrorHandler: func(ctx context.Context, r *toolscache.Reflector, err error) {
				},
			},
		})
		if err != nil {
			cancel()
			return nil, err
		}

		// Add field indexer for Pod spec.nodeName to enable efficient querying by node
		if err := mgr.GetFieldIndexer().IndexField(runCtx, &corev1.Pod{}, "spec.nodeName", func(rawObj client.Object) []string {
			pod := rawObj.(*corev1.Pod)
			if pod.Spec.NodeName == "" {
				return nil
			}
			return []string{pod.Spec.NodeName}
		}); err != nil {
			cancel()
			return nil, fmt.Errorf("failed to create field indexer for spec.nodeName: %w", err)
		}
		go func() {
			if err := mgr.Start(runCtx); err != nil {
				fmt.Printf("Error starting manager: %v\n", err)
			}
		}()

		syncCtx, cancelSync := context.WithTimeout(runCtx, cacheSyncTimeout)
		defer cancelSync()
		if !mgr.GetCache().WaitForCacheSync(syncCtx) {
			cancel()
			if err := syncCtx.Err(); err != nil {
				return nil, fmt.Errorf("failed to wait for cache sync within %s: %w", cacheSyncTimeout, err)
			}
			return nil, fmt.Errorf("failed to wait for cache sync within %s", cacheSyncTimeout)
		}
		c = mgr.GetClient()
	}

	return &K8sClient{
		Client:             c,
		ClientSet:          clientset,
		StreamingClientSet: streamingClientset,
		Configuration:      config,
		MetricsClient:      metricsClient,
		CacheEnabled:       cacheEnabled,
		cancel:             cancel,
	}, nil
}

func (c *K8sClient) Stop(name string) {
	klog.Infof("Stopping K8s client for %s", name)
	c.cancel()
}

// GetScheme returns the runtime scheme used by the client
func GetScheme() *runtime.Scheme {
	return runtimeScheme
}

func WaitForResourceDeletion(ctx context.Context, client client.Client, obj client.Object, timeout time.Duration) error {
	key := types.NamespacedName{
		Namespace: obj.GetNamespace(),
		Name:      obj.GetName(),
	}
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	timeoutCh := time.After(timeout)
	for {
		select {
		case <-timeoutCh:
			return fmt.Errorf("timed out waiting for resource deletion: %s", key)
		case <-ticker.C:
			if err := client.Get(ctx, key, obj); err != nil {
				if errors.IsNotFound(err) {
					return nil
				}
				return fmt.Errorf("failed to get resource: %w", err)
			} else if obj.GetDeletionTimestamp().IsZero() {
				// resource still exist, but deletion timestamp is not set
				// may be created again after deletion
				// we can consider it successfully deleted.
				return nil
			}
		}
	}
}
