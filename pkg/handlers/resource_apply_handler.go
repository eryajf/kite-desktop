package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-gonic/gin"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/serializer/yaml"
	"k8s.io/klog/v2"
	"sigs.k8s.io/controller-runtime/pkg/client"
	syaml "sigs.k8s.io/yaml"
)

type ResourceApplyHandler struct {
}

const (
	defaultApplyNamespace         = "default"
	emptyNamespaceLookupErrorText = "an empty namespace may not be set when a resource name is provided"
)

func NewResourceApplyHandler() *ResourceApplyHandler {
	return &ResourceApplyHandler{}
}

type ApplyResourceRequest struct {
	YAML string `json:"yaml" binding:"required"`
}

// ApplyResource applies a YAML resource to the cluster
func (h *ResourceApplyHandler) ApplyResource(c *gin.Context) {
	cs := c.MustGet("cluster").(*cluster.ClientSet)

	var req ApplyResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Decode YAML into unstructured object
	decodeUniversal := yaml.NewDecodingSerializer(unstructured.UnstructuredJSONScheme)
	obj := &unstructured.Unstructured{}

	_, _, err := decodeUniversal.Decode([]byte(req.YAML), nil, obj)
	if err != nil {
		klog.Errorf("Failed to decode YAML: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid YAML format: " + err.Error()})
		return
	}

	resource := strings.ToLower(obj.GetKind()) + "s"

	ctx := c.Request.Context()

	existingObj := &unstructured.Unstructured{}
	existingObj.SetGroupVersionKind(obj.GetObjectKind().GroupVersionKind())
	existingObj.SetName(obj.GetName())
	existingObj.SetNamespace(obj.GetNamespace())

	err = getExistingResourceForApply(ctx, cs.K8sClient, obj, existingObj)

	defer func() {
		operatorID := uint(0)
		if user, userErr := model.EnsureLocalDesktopUser(); userErr == nil {
			operatorID = user.ID
		}
		previousYAML := []byte{}
		if existingObj.GetResourceVersion() != "" {
			existingObj.SetManagedFields(nil)
			previousYAML, _ = syaml.Marshal(existingObj)
		}
		errMessage := ""
		if err != nil {
			errMessage = err.Error()
		}
		model.DB.Create(&model.ResourceHistory{
			ClusterName:   cs.Name,
			ResourceType:  resource,
			ResourceName:  obj.GetName(),
			Namespace:     obj.GetNamespace(),
			OperationType: "apply",
			ResourceYAML:  req.YAML,
			PreviousYAML:  string(previousYAML),
			OperatorID:    operatorID,
			Success:       err == nil,
			ErrorMessage:  errMessage,
		})
	}()

	switch {
	case apierrors.IsNotFound(err):
		if err := cs.K8sClient.Create(ctx, obj); err != nil {
			klog.Errorf("Failed to create resource: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create resource: " + err.Error()})
			return
		}
	case err == nil:
		obj.SetResourceVersion(existingObj.GetResourceVersion())
		if err := cs.K8sClient.Update(ctx, obj); err != nil {
			klog.Errorf("Failed to update resource: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update resource: " + err.Error()})
			return
		}
	default:
		klog.Errorf("Failed to get resource: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get resource: " + err.Error()})
		return
	}

	klog.Infof("Successfully applied resource: %s/%s", obj.GetKind(), obj.GetName())
	c.JSON(http.StatusOK, gin.H{
		"message":   "Resource applied successfully",
		"kind":      obj.GetKind(),
		"name":      obj.GetName(),
		"namespace": obj.GetNamespace(),
	})
}

func getExistingResourceForApply(ctx context.Context, kubeClient client.Client, obj, existingObj *unstructured.Unstructured) error {
	key := client.ObjectKey{
		Name:      obj.GetName(),
		Namespace: obj.GetNamespace(),
	}

	err := kubeClient.Get(ctx, key, existingObj)
	if shouldRetryApplyInDefaultNamespace(err, obj) {
		obj.SetNamespace(defaultApplyNamespace)
		existingObj.SetNamespace(defaultApplyNamespace)
		key.Namespace = defaultApplyNamespace
		err = kubeClient.Get(ctx, key, existingObj)
	}

	return err
}

func shouldRetryApplyInDefaultNamespace(err error, obj *unstructured.Unstructured) bool {
	if err == nil || obj == nil {
		return false
	}

	if strings.TrimSpace(obj.GetNamespace()) != "" {
		return false
	}

	return strings.Contains(err.Error(), emptyNamespaceLookupErrorText)
}
