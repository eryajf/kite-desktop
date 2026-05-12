package resources

import (
	"fmt"
	"net/http"
	"reflect"
	"sort"
	"strings"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
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

	if kind == "StatefulSet" {
		mergedEvents, err := h.appendStatefulSetPodEvents(c, cs, target, events.Items)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list related pod events: " + err.Error()})
			return
		}
		events.Items = mergedEvents
	}

	c.JSON(http.StatusOK, events)
}

func (h *EventHandler) appendStatefulSetPodEvents(
	c *gin.Context,
	cs *cluster.ClientSet,
	target interface{},
	baseEvents []corev1.Event,
) ([]corev1.Event, error) {
	statefulSet, ok := target.(*appsv1.StatefulSet)
	if !ok {
		return baseEvents, nil
	}

	selector, err := metav1.LabelSelectorAsSelector(statefulSet.Spec.Selector)
	if err != nil {
		return nil, err
	}

	pods, err := cs.K8sClient.ClientSet.CoreV1().Pods(statefulSet.Namespace).List(
		c.Request.Context(),
		metav1.ListOptions{LabelSelector: selector.String()},
	)
	if err != nil {
		return nil, err
	}

	merged := append([]corev1.Event{}, baseEvents...)
	seen := make(map[string]struct{}, len(merged))
	for _, event := range merged {
		seen[event.Namespace+"/"+event.Name] = struct{}{}
	}

	for _, pod := range pods.Items {
		podEvents, err := cs.K8sClient.ClientSet.CoreV1().Events(pod.Namespace).List(
			c.Request.Context(),
			metav1.ListOptions{
				FieldSelector: "involvedObject.kind=Pod,involvedObject.name=" + pod.Name,
			},
		)
		if err != nil {
			return nil, err
		}

		for _, event := range podEvents.Items {
			key := event.Namespace + "/" + event.Name
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			merged = append(merged, event)
		}
	}

	sort.SliceStable(merged, func(i, j int) bool {
		return eventTimestamp(merged[i]).After(eventTimestamp(merged[j]).Time)
	})

	return merged, nil
}

func eventTimestamp(event corev1.Event) metav1.Time {
	switch {
	case !event.LastTimestamp.IsZero():
		return event.LastTimestamp
	case !event.FirstTimestamp.IsZero():
		return event.FirstTimestamp
	case !event.EventTime.IsZero():
		return metav1.NewTime(event.EventTime.Time)
	default:
		return event.CreationTimestamp
	}
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
