package handlers

import (
	"context"
	"errors"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	"github.com/eryajf/kite-desktop/pkg/kube"
)

type applyLookupClient struct {
	client.Client
	keys []client.ObjectKey
}

func (c *applyLookupClient) Get(ctx context.Context, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
	c.keys = append(c.keys, key)
	if key.Namespace == "" && obj.GetObjectKind().GroupVersionKind().Kind != "Namespace" {
		return errors.New(emptyNamespaceLookupErrorText)
	}
	return c.Client.Get(ctx, key, obj, opts...)
}

func TestGetExistingResourceForApplyDefaultsEmptyNamespace(t *testing.T) {
	baseClient := fake.NewClientBuilder().
		WithScheme(kube.GetScheme()).
		Build()
	clientWithRetry := &applyLookupClient{Client: baseClient}

	obj := &unstructured.Unstructured{}
	obj.SetGroupVersionKind(schema.GroupVersionKind{Group: "", Version: "v1", Kind: "ConfigMap"})
	obj.SetName("demo")

	existingObj := &unstructured.Unstructured{}
	existingObj.SetGroupVersionKind(obj.GroupVersionKind())
	existingObj.SetName(obj.GetName())

	err := getExistingResourceForApply(context.Background(), clientWithRetry, obj, existingObj)
	if !apierrors.IsNotFound(err) {
		t.Fatalf("expected not found after retrying in default namespace, got %v", err)
	}

	if obj.GetNamespace() != defaultApplyNamespace {
		t.Fatalf("object namespace = %q, want %q", obj.GetNamespace(), defaultApplyNamespace)
	}
	if existingObj.GetNamespace() != defaultApplyNamespace {
		t.Fatalf("existing object namespace = %q, want %q", existingObj.GetNamespace(), defaultApplyNamespace)
	}
	if len(clientWithRetry.keys) != 2 {
		t.Fatalf("expected 2 get attempts, got %d", len(clientWithRetry.keys))
	}
	if clientWithRetry.keys[0].Namespace != "" {
		t.Fatalf("first lookup namespace = %q, want empty", clientWithRetry.keys[0].Namespace)
	}
	if clientWithRetry.keys[1].Namespace != defaultApplyNamespace {
		t.Fatalf("second lookup namespace = %q, want %q", clientWithRetry.keys[1].Namespace, defaultApplyNamespace)
	}
}

func TestGetExistingResourceForApplyKeepsClusterScopedEmptyNamespace(t *testing.T) {
	namespaceObj := &unstructured.Unstructured{}
	namespaceObj.SetGroupVersionKind(schema.GroupVersionKind{Group: "", Version: "v1", Kind: "Namespace"})
	namespaceObj.SetName("demo")

	existingObj := &unstructured.Unstructured{}
	existingObj.SetGroupVersionKind(namespaceObj.GroupVersionKind())
	existingObj.SetName(namespaceObj.GetName())

	clientWithNotFound := &applyLookupClient{
		Client: fake.NewClientBuilder().
			WithScheme(kube.GetScheme()).
			Build(),
	}

	err := getExistingResourceForApply(context.Background(), clientWithNotFound, namespaceObj, existingObj)
	if err == nil {
		t.Fatal("expected get error for missing namespace object")
	}
	if namespaceObj.GetNamespace() != "" {
		t.Fatalf("cluster-scoped object namespace = %q, want empty", namespaceObj.GetNamespace())
	}
	if len(clientWithNotFound.keys) != 1 {
		t.Fatalf("expected 1 get attempt for cluster-scoped object, got %d", len(clientWithNotFound.keys))
	}
}

func TestShouldRetryApplyInDefaultNamespace(t *testing.T) {
	obj := &unstructured.Unstructured{}
	obj.SetGroupVersionKind(schema.GroupVersionKind{Group: "", Version: "v1", Kind: "ConfigMap"})
	obj.SetName("demo")

	if !shouldRetryApplyInDefaultNamespace(errors.New(emptyNamespaceLookupErrorText), obj) {
		t.Fatal("expected retry decision for namespaced resource with empty namespace")
	}

	obj.SetNamespace("custom")
	if shouldRetryApplyInDefaultNamespace(errors.New(emptyNamespaceLookupErrorText), obj) {
		t.Fatal("did not expect retry when namespace is already set")
	}

	obj.SetNamespace("")
	if shouldRetryApplyInDefaultNamespace(apierrors.NewNotFound(schema.GroupResource{Group: "", Resource: "configmaps"}, "demo"), obj) {
		t.Fatal("did not expect retry for ordinary not found error")
	}
	if shouldRetryApplyInDefaultNamespace(nil, obj) {
		t.Fatal("did not expect retry for nil error")
	}
}
