package resources

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/kube"
	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/sets"
	"k8s.io/klog/v2"
	kubectldrain "k8s.io/kubectl/pkg/drain"
	metricsv1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

const defaultDrainTimeout = 5 * time.Minute

type NodeHandler struct {
	*GenericResourceHandler[*corev1.Node, *corev1.NodeList]
}

func NewNodeHandler() *NodeHandler {
	return &NodeHandler{
		GenericResourceHandler: NewGenericResourceHandler[*corev1.Node, *corev1.NodeList](
			"nodes",
			true, // Nodes are cluster-scoped resources
			true,
		),
	}
}

// DrainNode drains a node by evicting all pods
func (h *NodeHandler) DrainNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()
	cs := c.MustGet("cluster").(*cluster.ClientSet)
	// Parse the request body for drain options
	var drainRequest struct {
		Force            *bool `json:"force" binding:"required"`
		GracePeriod      int   `json:"gracePeriod" binding:"min=0"`
		DeleteLocal      bool  `json:"deleteLocalData"`
		IgnoreDaemonsets bool  `json:"ignoreDaemonsets"`
	}

	if err := c.ShouldBindJSON(&drainRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	if cs.K8sClient == nil || cs.K8sClient.ClientSet == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Kubernetes client is not initialized"})
		return
	}

	node, err := cs.K8sClient.ClientSet.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var out bytes.Buffer
	var errOut bytes.Buffer
	drainer := &kubectldrain.Helper{
		Ctx:                             ctx,
		Client:                          cs.K8sClient.ClientSet,
		Force:                           *drainRequest.Force,
		GracePeriodSeconds:              drainRequest.GracePeriod,
		IgnoreAllDaemonSets:             drainRequest.IgnoreDaemonsets,
		DeleteEmptyDirData:              drainRequest.DeleteLocal,
		Timeout:                         defaultDrainTimeout,
		EvictErrorRetryDelay:            5 * time.Second,
		SkipWaitForDeleteTimeoutSeconds: 0,
		ChunkSize:                       500,
		Out:                             &out,
		ErrOut:                          &errOut,
	}

	if err := kubectldrain.RunCordonOrUncordon(drainer, node, true); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cordon node: " + err.Error()})
		return
	}

	podDeleteList, errs := drainer.GetPodsForDeletion(nodeName)
	if len(errs) > 0 {
		c.JSON(http.StatusConflict, gin.H{
			"error":       formatDrainErrors(errs),
			"errorDetail": drainErrorDetail(errs),
			"node":        node.Name,
			"warnings":    errOut.String(),
		})
		return
	}

	warnings := podDeleteList.Warnings()
	pods := podDeleteList.Pods()
	podRefs := podNames(pods)

	go func() {
		drainCtx, cancel := context.WithTimeout(context.Background(), defaultDrainTimeout)
		defer cancel()

		drainer.Ctx = drainCtx
		if err := drainer.DeleteOrEvictPods(pods); err != nil {
			klog.Errorf("Failed to drain node %s: %v", node.Name, err)
			return
		}
		klog.Infof("Node %s drain completed, pods=%v", node.Name, podRefs)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message":  fmt.Sprintf("Node %s drain started", nodeName),
		"node":     node.Name,
		"pods":     podRefs,
		"warnings": warnings,
		"output":   strings.TrimSpace(out.String()),
		"options": gin.H{
			"force":            *drainRequest.Force,
			"gracePeriod":      drainRequest.GracePeriod,
			"deleteLocalData":  drainRequest.DeleteLocal,
			"ignoreDaemonsets": drainRequest.IgnoreDaemonsets,
		},
	})
}

func formatDrainErrors(errs []error) string {
	parts := make([]string, 0, len(errs))
	for _, err := range errs {
		if err != nil {
			parts = append(parts, err.Error())
		}
	}
	return strings.Join(parts, "; ")
}

func drainErrorDetail(errs []error) string {
	message := formatDrainErrors(errs)
	switch {
	case strings.Contains(message, "Pods with local storage"):
		return "The node has Pods that use emptyDir local storage. Enable Delete local data and retry if these temporary files can be discarded."
	case strings.Contains(message, "DaemonSet-managed Pods"):
		return "The node has DaemonSet-managed Pods. Enable Ignore DaemonSets and retry; DaemonSet Pods are managed by their controller."
	case strings.Contains(message, "declare no controller"):
		return "The node has Pods without a controller. Enable Force drain only if deleting these standalone Pods is acceptable."
	default:
		return ""
	}
}

func podNames(pods []corev1.Pod) []string {
	names := sets.New[string]()
	for _, pod := range pods {
		names.Insert(fmt.Sprintf("%s/%s", pod.Namespace, pod.Name))
	}
	return sets.List(names)
}

func (h *NodeHandler) markNodeSchedulable(ctx context.Context, client *kube.K8sClient, nodeName string, schedulable bool) error {
	// Get the current node
	var node corev1.Node
	if err := client.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		return err
	}
	node.Spec.Unschedulable = !schedulable
	if err := client.Update(ctx, &node); err != nil {
		return err
	}
	return nil
}

// CordonNode marks a node as unschedulable
func (h *NodeHandler) CordonNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()
	cs := c.MustGet("cluster").(*cluster.ClientSet)

	if err := h.markNodeSchedulable(ctx, cs.K8sClient, nodeName, false); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Node %s cordoned successfully", nodeName),
	})
}

// UncordonNode marks a node as schedulable
func (h *NodeHandler) UncordonNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()
	cs := c.MustGet("cluster").(*cluster.ClientSet)

	if err := h.markNodeSchedulable(ctx, cs.K8sClient, nodeName, true); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Node %s uncordoned successfully", nodeName),
	})
}

// TaintNode adds or updates taints on a node
func (h *NodeHandler) TaintNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()
	cs := c.MustGet("cluster").(*cluster.ClientSet)

	// Parse the request body for taint information
	var taintRequest struct {
		Key    string `json:"key" binding:"required"`
		Value  string `json:"value"`
		Effect string `json:"effect" binding:"required,oneof=NoSchedule PreferNoSchedule NoExecute"`
	}

	if err := c.ShouldBindJSON(&taintRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	// Get the current node
	var node corev1.Node
	if err := cs.K8sClient.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create the new taint
	newTaint := corev1.Taint{
		Key:    taintRequest.Key,
		Value:  taintRequest.Value,
		Effect: corev1.TaintEffect(taintRequest.Effect),
	}

	// Check if taint with same key already exists and update it, otherwise add new taint
	found := false
	for i, taint := range node.Spec.Taints {
		if taint.Key == taintRequest.Key {
			node.Spec.Taints[i] = newTaint
			found = true
			break
		}
	}

	if !found {
		node.Spec.Taints = append(node.Spec.Taints, newTaint)
	}

	// Update the node
	if err := cs.K8sClient.Update(ctx, &node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to taint node: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Node %s tainted successfully", nodeName),
		"node":    node.Name,
		"taint":   newTaint,
	})
}

// UntaintNode removes a taint from a node
func (h *NodeHandler) UntaintNode(c *gin.Context) {
	nodeName := c.Param("name")
	ctx := c.Request.Context()
	cs := c.MustGet("cluster").(*cluster.ClientSet)

	// Parse the request body for taint key to remove
	var untaintRequest struct {
		Key string `json:"key" binding:"required"`
	}

	if err := c.ShouldBindJSON(&untaintRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	// Get the current node
	var node corev1.Node
	if err := cs.K8sClient.Get(ctx, types.NamespacedName{Name: nodeName}, &node); err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Node not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Find and remove the taint with the specified key
	originalLength := len(node.Spec.Taints)
	var newTaints []corev1.Taint
	for _, taint := range node.Spec.Taints {
		if taint.Key != untaintRequest.Key {
			newTaints = append(newTaints, taint)
		}
	}
	node.Spec.Taints = newTaints

	if len(newTaints) == originalLength {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Taint with key '%s' not found on node", untaintRequest.Key)})
		return
	}

	// Update the node
	if err := cs.K8sClient.Update(ctx, &node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to untaint node: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         fmt.Sprintf("Taint with key '%s' removed from node %s successfully", untaintRequest.Key, nodeName),
		"node":            node.Name,
		"removedTaintKey": untaintRequest.Key,
	})
}

func (h *NodeHandler) List(c *gin.Context) {
	cs := c.MustGet("cluster").(*cluster.ClientSet)
	var nodeMetrics metricsv1.NodeMetricsList

	var nodes corev1.NodeList
	if err := cs.K8sClient.List(c.Request.Context(), &nodes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list nodes: " + err.Error()})
		return
	}

	if err := cs.K8sClient.List(c.Request.Context(), &nodeMetrics); err != nil {
		klog.Warningf("Failed to list node metrics: %v", err)
	}

	nodeMetricsMap := buildNodeMetricsMap(nodeMetrics.Items)
	nodeResourceRequests := listNodeResourceRequests(c.Request.Context(), cs.K8sClient, nodes.Items)

	result := &common.NodeListWithMetrics{
		TypeMeta: nodes.TypeMeta,
		ListMeta: nodes.ListMeta,
		Items:    []*common.NodeWithMetrics{},
	}
	result.Items = make([]*common.NodeWithMetrics, len(nodes.Items))
	for i, node := range nodes.Items {
		metricsCell := &common.MetricsCell{}
		metricsCell.CPULimit = node.Status.Allocatable.Cpu().MilliValue()
		metricsCell.MemoryLimit = node.Status.Allocatable.Memory().Value()
		metricsCell.PodsLimit = node.Status.Allocatable.Pods().Value()

		if nm, ok := nodeMetricsMap[node.Name]; ok {
			if cpuQuantity, ok := nm.Usage["cpu"]; ok {
				metricsCell.CPUUsage = cpuQuantity.MilliValue()
			}
			if memQuantity, ok := nm.Usage["memory"]; ok {
				metricsCell.MemoryUsage = memQuantity.Value()
			}
		}
		if requests, exists := nodeResourceRequests[node.Name]; exists {
			metricsCell.CPURequest = requests.CPURequest
			metricsCell.MemoryRequest = requests.MemoryRequest
			metricsCell.Pods = requests.Pods
		}
		result.Items[i] = &common.NodeWithMetrics{
			Node:    &node,
			Metrics: metricsCell,
		}
	}
	sort.Slice(result.Items, func(i, j int) bool {
		return result.Items[i].Name < result.Items[j].Name
	})
	c.JSON(http.StatusOK, result)
}

func (h *NodeHandler) registerCustomRoutes(group *gin.RouterGroup) {
	group.POST("/_all/:name/drain", h.DrainNode)
	group.POST("/_all/:name/cordon", h.CordonNode)
	group.POST("/_all/:name/uncordon", h.UncordonNode)
	group.POST("/_all/:name/taint", h.TaintNode)
	group.POST("/_all/:name/untaint", h.UntaintNode)
}

func buildNodeMetricsMap(nodeMetrics []metricsv1.NodeMetrics) map[string]metricsv1.NodeMetrics {
	metricsMap := make(map[string]metricsv1.NodeMetrics, len(nodeMetrics))
	for _, nodeMetric := range nodeMetrics {
		metricsMap[nodeMetric.Name] = nodeMetric
	}
	return metricsMap
}

func listNodeResourceRequests(ctx context.Context, k8sClient *kube.K8sClient, nodes []corev1.Node) map[string]common.MetricsCell {
	if !k8sClient.CacheEnabled {
		return listNodeResourceRequestsFromAllPods(ctx, k8sClient)
	}

	nodeResourceRequests := make(map[string]common.MetricsCell, len(nodes))
	for _, node := range nodes {
		var nodePods corev1.PodList
		if err := k8sClient.List(ctx, &nodePods, client.MatchingFields{"spec.nodeName": node.Name}); err != nil {
			klog.Warningf("Failed to list pods for node %s: %v", node.Name, err)
			continue
		}

		var metrics common.MetricsCell
		for i := range nodePods.Items {
			addPodResources(&metrics, &nodePods.Items[i])
		}
		nodeResourceRequests[node.Name] = metrics
	}
	return nodeResourceRequests
}

func listNodeResourceRequestsFromAllPods(ctx context.Context, k8sClient *kube.K8sClient) map[string]common.MetricsCell {
	var allPods corev1.PodList
	if err := k8sClient.List(ctx, &allPods); err != nil {
		klog.Warningf("Failed to list pods: %v", err)
		return map[string]common.MetricsCell{}
	}

	nodeResourceRequests := make(map[string]common.MetricsCell)
	for i := range allPods.Items {
		pod := &allPods.Items[i]
		if pod.Spec.NodeName == "" {
			continue
		}

		metrics := nodeResourceRequests[pod.Spec.NodeName]
		addPodResources(&metrics, pod)
		nodeResourceRequests[pod.Spec.NodeName] = metrics
	}
	return nodeResourceRequests
}

func addPodResources(metrics *common.MetricsCell, pod *corev1.Pod) {
	metrics.Pods++
	for _, container := range pod.Spec.Containers {
		if cpuRequest := container.Resources.Requests.Cpu(); cpuRequest != nil {
			metrics.CPURequest += cpuRequest.MilliValue()
		}
		if memoryRequest := container.Resources.Requests.Memory(); memoryRequest != nil {
			metrics.MemoryRequest += memoryRequest.Value()
		}
	}
}
