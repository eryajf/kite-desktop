package resources

import (
	"fmt"
	"net/http"
	"reflect"
	"strings"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type EventHandler struct {
	GenericResourceHandler[*corev1.Event, *corev1.EventList]
}

func NewEventHandler() *EventHandler {
	return &EventHandler{
		GenericResourceHandler: *NewGenericResourceHandler[*corev1.Event, *corev1.EventList](
			"events",
			false,
			false,
		),
	}
}

func (h *EventHandler) ListResourceEvents(c *gin.Context) {
	name := c.Query("name")
	namespace := c.Query("namespace")
	resource := c.Query("resource")
	cs := c.MustGet("cluster").(*cluster.ClientSet)
	target, err := GetResource(c, resource, namespace, name)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Failed to get resource: " + err.Error()})
		return
	}

	kind, err := eventResourceKind(resource, target)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve object kind: " + err.Error()})
		return
	}
	obj := target.(metav1.Object)
	events, err := cs.K8sClient.ClientSet.CoreV1().Events(obj.GetNamespace()).List(c.Request.Context(), metav1.ListOptions{
		FieldSelector: "involvedObject.kind=" + kind +
			",involvedObject.name=" + name,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list events: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, events)
}

func eventResourceKind(resource string, target interface{}) (string, error) {
	objType, err := meta.TypeAccessor(target)
	if err != nil {
		return "", err
	}
	if kind := objType.GetKind(); kind != "" {
		return kind, nil
	}

	typ := reflect.TypeOf(target)
	for typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	if typ.Name() != "" {
		return typ.Name(), nil
	}

	kind := strings.TrimSuffix(resource, "s")
	if kind == "" {
		return "", fmt.Errorf("empty resource type")
	}
	return strings.ToUpper(kind[:1]) + kind[1:], nil
}

func (h *EventHandler) registerCustomRoutes(group *gin.RouterGroup) {
	group.GET("/resources", h.ListResourceEvents)
}
