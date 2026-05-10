package resources

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/kube"
	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	v1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"sigs.k8s.io/controller-runtime/pkg/client"
	gatewayapiv1 "sigs.k8s.io/gateway-api/apis/v1"
)

func discoverServices(ctx context.Context, k8sClient *kube.K8sClient, namespace string, selector *metav1.LabelSelector) ([]common.RelatedResource, error) {
	services, err := discoverMatchingServices(ctx, k8sClient, namespace, selector)
	if err != nil {
		return nil, err
	}

	relatedServices := make([]common.RelatedResource, 0, len(services))
	for _, service := range services {
		relatedServices = append(relatedServices, common.RelatedResource{
			Type:      "services",
			Namespace: service.Namespace,
			Name:      service.Name,
			Direction: common.RelatedDirectionReferencedBy,
			Reason:    "service selector matches workload pods",
		})
	}

	return relatedServices, nil
}

func discoverMatchingServices(ctx context.Context, k8sClient *kube.K8sClient, namespace string, selector *metav1.LabelSelector) ([]corev1.Service, error) {
	if selector == nil || selector.MatchLabels == nil {
		return []corev1.Service{}, nil
	}

	var serviceList corev1.ServiceList
	if err := k8sClient.List(ctx, &serviceList, client.InNamespace(namespace)); err != nil {
		return nil, fmt.Errorf("failed to list services: %w", err)
	}

	var relatedServices []corev1.Service
	for _, service := range serviceList.Items {
		if service.Spec.Selector != nil {
			serviceSelector := labels.SelectorFromSet(service.Spec.Selector)
			if serviceSelector.Matches(labels.Set(selector.MatchLabels)) {
				relatedServices = append(relatedServices, service)
			}
		}
	}

	return relatedServices, nil
}

func discoverIngressServices(namespace string, ingress *v1.Ingress) []common.RelatedResource {
	seen := make(map[string]struct{})
	var relatedServices []common.RelatedResource
	addService := func(svcName string) {
		if _, exist := seen[svcName]; exist {
			return
		}
		seen[svcName] = struct{}{}
		relatedServices = append(relatedServices, common.RelatedResource{
			Type:       "services",
			Namespace:  namespace,
			Name:       svcName,
			APIVersion: corev1.SchemeGroupVersion.String(),
			Direction:  common.RelatedDirectionReferences,
			Reason:     "ingress backend service",
		})
	}

	for _, rule := range ingress.Spec.Rules {
		if rule.HTTP == nil {
			continue
		}

		for _, path := range rule.HTTP.Paths {
			if path.Backend.Service == nil {
				continue
			}
			addService(path.Backend.Service.Name)
		}
	}
	if ingress.Spec.DefaultBackend != nil && ingress.Spec.DefaultBackend.Service != nil {
		if _, exist := seen[ingress.Spec.DefaultBackend.Service.Name]; !exist {
			addService(ingress.Spec.DefaultBackend.Service.Name)
		}
	}

	return relatedServices
}

func discoverConfigs(namespace string, podSpec *corev1.PodTemplateSpec) []common.RelatedResource {
	if podSpec == nil {
		return []common.RelatedResource{}
	}

	configMapSet := make(map[string]struct{})
	secretSet := make(map[string]struct{})
	pvcSet := make(map[string]struct{})

	containers := podSpec.Spec.Containers
	containers = append(containers, podSpec.Spec.InitContainers...)
	for _, container := range containers {
		for _, envVar := range container.Env {
			if envVar.ValueFrom != nil && envVar.ValueFrom.ConfigMapKeyRef != nil {
				configMapSet[envVar.ValueFrom.ConfigMapKeyRef.Name] = struct{}{}
			}
			if envVar.ValueFrom != nil && envVar.ValueFrom.SecretKeyRef != nil {
				secretSet[envVar.ValueFrom.SecretKeyRef.Name] = struct{}{}
			}
		}
		for _, envFrom := range container.EnvFrom {
			if envFrom.ConfigMapRef != nil {
				configMapSet[envFrom.ConfigMapRef.Name] = struct{}{}
			}
			if envFrom.SecretRef != nil {
				secretSet[envFrom.SecretRef.Name] = struct{}{}
			}
		}
	}

	for _, volume := range podSpec.Spec.Volumes {
		if volume.ConfigMap != nil {
			configMapSet[volume.ConfigMap.Name] = struct{}{}
		}
		if volume.Secret != nil {
			secretSet[volume.Secret.SecretName] = struct{}{}
		}
		if volume.PersistentVolumeClaim != nil {
			pvcSet[volume.PersistentVolumeClaim.ClaimName] = struct{}{}
		}
	}
	for _, imagePullSecret := range podSpec.Spec.ImagePullSecrets {
		if imagePullSecret.Name != "" {
			secretSet[imagePullSecret.Name] = struct{}{}
		}
	}

	var related []common.RelatedResource
	if podSpec.Spec.ServiceAccountName != "" {
		related = append(related, common.RelatedResource{
			Type:      "serviceaccounts",
			Name:      podSpec.Spec.ServiceAccountName,
			Namespace: namespace,
			Direction: common.RelatedDirectionReferences,
			Reason:    "pod template service account",
		})
	}
	for name := range configMapSet {
		related = append(related, common.RelatedResource{
			Type:      "configmaps",
			Name:      name,
			Namespace: namespace,
			Direction: common.RelatedDirectionReferences,
			Reason:    "pod template reference",
		})
	}
	for name := range secretSet {
		related = append(related, common.RelatedResource{
			Type:      "secrets",
			Name:      name,
			Namespace: namespace,
			Direction: common.RelatedDirectionReferences,
			Reason:    "pod template reference",
		})
	}
	for name := range pvcSet {
		related = append(related, common.RelatedResource{
			Type:      "persistentvolumeclaims",
			Name:      name,
			Namespace: namespace,
			Direction: common.RelatedDirectionReferences,
			Reason:    "pod template volume claim",
		})
	}

	return related
}

func checkInUsedConfigs(spec *corev1.PodTemplateSpec, name string, resourceType string) bool {
	if spec == nil {
		return false
	}

	containers := spec.Spec.Containers
	containers = append(containers, spec.Spec.InitContainers...)
	for _, container := range containers {
		for _, envVar := range container.Env {
			if envVar.ValueFrom != nil {
				if resourceType == "configmaps" && envVar.ValueFrom.ConfigMapKeyRef != nil && envVar.ValueFrom.ConfigMapKeyRef.Name == name {
					return true
				}
				if resourceType == "secrets" && envVar.ValueFrom.SecretKeyRef != nil && envVar.ValueFrom.SecretKeyRef.Name == name {
					return true
				}
			}
		}
		for _, envFrom := range container.EnvFrom {
			if resourceType == "configmaps" && envFrom.ConfigMapRef != nil && envFrom.ConfigMapRef.Name == name {
				return true
			}
			if resourceType == "secrets" && envFrom.SecretRef != nil && envFrom.SecretRef.Name == name {
				return true
			}
		}
	}
	for _, volume := range spec.Spec.Volumes {
		if resourceType == "configmaps" && volume.ConfigMap != nil && volume.ConfigMap.Name == name {
			return true
		}
		if resourceType == "secrets" && volume.Secret != nil && volume.Secret.SecretName == name {
			return true
		}
		if resourceType == "persistentvolumeclaims" && volume.PersistentVolumeClaim != nil && volume.PersistentVolumeClaim.ClaimName == name {
			return true
		}
	}
	return false
}

// discoveryWorkloads finds Deployments, StatefulSets and DaemonSets that
// reference the given ConfigMap/Secret/PVC.  The three List calls are
// independent, so we fire them in parallel with errgroup.
func discoveryWorkloads(ctx context.Context, k8sClient *kube.K8sClient, namespace string, name string, resourceType string) ([]common.RelatedResource, error) {
	g, gctx := errgroup.WithContext(ctx)

	var deploymentList appsv1.DeploymentList
	var statefulSetList appsv1.StatefulSetList
	var daemonSetList appsv1.DaemonSetList

	g.Go(func() error {
		return k8sClient.List(gctx, &deploymentList, client.InNamespace(namespace))
	})
	g.Go(func() error {
		return k8sClient.List(gctx, &statefulSetList, client.InNamespace(namespace))
	})
	g.Go(func() error {
		return k8sClient.List(gctx, &daemonSetList, client.InNamespace(namespace))
	})

	if err := g.Wait(); err != nil {
		return nil, err
	}

	// Each list is owned exclusively by this goroutine after Wait — safe to read.
	var related []common.RelatedResource
	for _, deployment := range deploymentList.Items {
		if checkInUsedConfigs(&deployment.Spec.Template, name, resourceType) {
			related = append(related, common.RelatedResource{
				Type:      "deployments",
				Name:      deployment.Name,
				Namespace: deployment.Namespace,
				Direction: common.RelatedDirectionReferencedBy,
				Reason:    "workload pod template reference",
			})
		}
	}
	for _, statefulSet := range statefulSetList.Items {
		if checkInUsedConfigs(&statefulSet.Spec.Template, name, resourceType) {
			related = append(related, common.RelatedResource{
				Type:      "statefulsets",
				Name:      statefulSet.Name,
				Namespace: statefulSet.Namespace,
				Direction: common.RelatedDirectionReferencedBy,
				Reason:    "workload pod template reference",
			})
		}
	}
	for _, daemonSet := range daemonSetList.Items {
		if checkInUsedConfigs(&daemonSet.Spec.Template, name, resourceType) {
			related = append(related, common.RelatedResource{
				Type:      "daemonsets",
				Name:      daemonSet.Name,
				Namespace: daemonSet.Namespace,
				Direction: common.RelatedDirectionReferencedBy,
				Reason:    "workload pod template reference",
			})
		}
	}
	return related, nil
}

func discoverPodsByService(ctx context.Context, k8sClient *kube.K8sClient, service *corev1.Service) []common.RelatedResource {
	var endpoints corev1.Endpoints
	if err := k8sClient.Get(ctx, client.ObjectKey{Namespace: service.Namespace, Name: service.Name}, &endpoints); err != nil {
		// Endpoints might not be found, which is not a critical error.
		// For example, for external name services.
		return nil
	}

	var relatedPods []common.RelatedResource
	for _, subset := range endpoints.Subsets {
		for _, addr := range subset.Addresses {
			if addr.TargetRef != nil && addr.TargetRef.Kind == "Pod" {
				relatedPods = append(relatedPods, common.RelatedResource{
					Type:      "pods",
					Namespace: addr.TargetRef.Namespace,
					Name:      addr.TargetRef.Name,
					Direction: common.RelatedDirectionReferences,
					Reason:    "service endpoint target",
				})
			}
		}
	}
	return relatedPods
}

func discoverDeploymentOwnedReplicaSets(ctx context.Context, k8sClient *kube.K8sClient, deployment *appsv1.Deployment) ([]appsv1.ReplicaSet, error) {
	var replicaSetList appsv1.ReplicaSetList
	if err := k8sClient.List(ctx, &replicaSetList, client.InNamespace(deployment.Namespace)); err != nil {
		return nil, fmt.Errorf("failed to list replicasets: %w", err)
	}

	var relatedReplicaSets []appsv1.ReplicaSet
	for _, rs := range replicaSetList.Items {
		for _, owner := range rs.OwnerReferences {
			if owner.Kind == "Deployment" && owner.Name == deployment.Name {
				relatedReplicaSets = append(relatedReplicaSets, rs)
				break
			}
		}
	}
	return relatedReplicaSets, nil
}

func discoverPodsByReplicaSets(ctx context.Context, k8sClient *kube.K8sClient, namespace string, replicaSets []appsv1.ReplicaSet) ([]common.RelatedResource, error) {
	if len(replicaSets) == 0 {
		return []common.RelatedResource{}, nil
	}

	ownedReplicaSets := make(map[string]struct{}, len(replicaSets))
	for _, rs := range replicaSets {
		ownedReplicaSets[rs.Name] = struct{}{}
	}

	var podList corev1.PodList
	if err := k8sClient.List(ctx, &podList, client.InNamespace(namespace)); err != nil {
		return nil, fmt.Errorf("failed to list pods: %w", err)
	}

	var relatedPods []common.RelatedResource
	for _, pod := range podList.Items {
		for _, owner := range pod.OwnerReferences {
			if owner.Kind == "ReplicaSet" {
				if _, ok := ownedReplicaSets[owner.Name]; ok {
					relatedPods = append(relatedPods, common.RelatedResource{
						Type:      "pods",
						Namespace: pod.Namespace,
						Name:      pod.Name,
						Direction: common.RelatedDirectionReferencedBy,
						Reason:    "pod owned by deployment replica set",
					})
					break
				}
			}
		}
	}
	return relatedPods, nil
}

func discoverServiceNetworkResources(ctx context.Context, k8sClient *kube.K8sClient, services []corev1.Service) ([]common.RelatedResource, error) {
	if len(services) == 0 {
		return []common.RelatedResource{}, nil
	}

	serviceSet := make(map[string]corev1.Service, len(services))
	for _, service := range services {
		serviceSet[service.Namespace+"/"+service.Name] = service
	}

	var result []common.RelatedResource
	for _, service := range services {
		result = append(result, common.RelatedResource{
			Type:       "endpoints",
			Namespace:  service.Namespace,
			Name:       service.Name,
			APIVersion: corev1.SchemeGroupVersion.String(),
			Direction:  common.RelatedDirectionReferencedBy,
			Reason:     "service endpoint for matching selector",
		})

		var endpointSliceList discoveryv1.EndpointSliceList
		if err := k8sClient.List(ctx, &endpointSliceList, client.InNamespace(service.Namespace), client.MatchingLabels{
			discoveryv1.LabelServiceName: service.Name,
		}); err != nil {
			return nil, fmt.Errorf("failed to list endpoint slices: %w", err)
		}
		for _, endpointSlice := range endpointSliceList.Items {
			result = append(result, common.RelatedResource{
				Type:       "endpointslices",
				Namespace:  endpointSlice.Namespace,
				Name:       endpointSlice.Name,
				APIVersion: discoveryv1.SchemeGroupVersion.String(),
				Direction:  common.RelatedDirectionReferencedBy,
				Reason:     "endpoint slice for matching service",
			})
		}
	}

	var ingressList v1.IngressList
	if err := k8sClient.List(ctx, &ingressList); err != nil {
		return nil, fmt.Errorf("failed to list ingresses: %w", err)
	}
	for _, ingress := range ingressList.Items {
		for _, relatedService := range discoverIngressServices(ingress.Namespace, &ingress) {
			if _, ok := serviceSet[relatedService.Namespace+"/"+relatedService.Name]; ok {
				result = append(result, common.RelatedResource{
					Type:       "ingresses",
					Namespace:  ingress.Namespace,
					Name:       ingress.Name,
					APIVersion: v1.SchemeGroupVersion.String(),
					Direction:  common.RelatedDirectionReferencedBy,
					Reason:     "routes traffic to matching service",
				})
				break
			}
		}
	}

	var httpRouteList gatewayapiv1.HTTPRouteList
	if err := k8sClient.List(ctx, &httpRouteList); err != nil {
		return nil, fmt.Errorf("failed to list httproutes: %w", err)
	}
	for _, route := range httpRouteList.Items {
		for _, related := range getHTTPRouteRelatedResouces(&route, route.Namespace) {
			if related.Type == "services" {
				if _, ok := serviceSet[related.Namespace+"/"+related.Name]; ok {
					result = append(result, common.RelatedResource{
						Type:       "httproutes",
						Namespace:  route.Namespace,
						Name:       route.Name,
						APIVersion: gatewayapiv1.GroupVersion.String(),
						Direction:  common.RelatedDirectionReferencedBy,
						Reason:     "routes traffic to matching service",
					})
					break
				}
			}
		}
	}

	return result, nil
}

func discoverDeploymentHPAs(ctx context.Context, k8sClient *kube.K8sClient, deployment *appsv1.Deployment) ([]common.RelatedResource, error) {
	var hpaList autoscalingv2.HorizontalPodAutoscalerList
	if err := k8sClient.List(ctx, &hpaList, client.InNamespace(deployment.Namespace)); err != nil {
		return nil, fmt.Errorf("failed to list horizontalpodautoscalers: %w", err)
	}

	var result []common.RelatedResource
	for _, hpa := range hpaList.Items {
		target := hpa.Spec.ScaleTargetRef
		if target.Kind == "Deployment" && target.Name == deployment.Name {
			result = append(result, common.RelatedResource{
				Type:       "horizontalpodautoscalers",
				Namespace:  hpa.Namespace,
				Name:       hpa.Name,
				APIVersion: autoscalingv2.SchemeGroupVersion.String(),
				Direction:  common.RelatedDirectionReferencedBy,
				Reason:     "scales deployment",
			})
		}
	}
	return result, nil
}

func discoverDeploymentReferencedBy(ctx context.Context, k8sClient *kube.K8sClient, deployment *appsv1.Deployment) ([]common.RelatedResource, error) {
	var result []common.RelatedResource

	replicaSets, err := discoverDeploymentOwnedReplicaSets(ctx, k8sClient, deployment)
	if err != nil {
		return nil, err
	}
	for _, rs := range replicaSets {
		result = append(result, common.RelatedResource{
			Type:       "replicasets",
			Namespace:  rs.Namespace,
			Name:       rs.Name,
			APIVersion: appsv1.SchemeGroupVersion.String(),
			Direction:  common.RelatedDirectionReferencedBy,
			Reason:     "owned by deployment",
		})
	}

	pods, err := discoverPodsByReplicaSets(ctx, k8sClient, deployment.Namespace, replicaSets)
	if err != nil {
		return nil, err
	}
	result = append(result, pods...)

	services, err := discoverMatchingServices(ctx, k8sClient, deployment.Namespace, deployment.Spec.Selector)
	if err != nil {
		return nil, err
	}
	for _, service := range services {
		result = append(result, common.RelatedResource{
			Type:       "services",
			Namespace:  service.Namespace,
			Name:       service.Name,
			APIVersion: corev1.SchemeGroupVersion.String(),
			Direction:  common.RelatedDirectionReferencedBy,
			Reason:     "service selector matches workload pods",
		})
	}
	networkResources, err := discoverServiceNetworkResources(ctx, k8sClient, services)
	if err != nil {
		return nil, err
	}
	result = append(result, networkResources...)

	hpas, err := discoverDeploymentHPAs(ctx, k8sClient, deployment)
	if err != nil {
		return nil, err
	}
	result = append(result, hpas...)

	return result, nil
}

func GetRelatedResources(c *gin.Context) {
	cs := c.MustGet("cluster").(*cluster.ClientSet)
	namespace := c.Param("namespace")
	name := c.Param("name")
	resourceType := c.GetString("resource") // Get resource type from context

	resource, err := GetResource(c, resourceType, namespace, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get resource: " + err.Error()})
		return
	}
	ctx := c.Request.Context()
	var podSpec *corev1.PodTemplateSpec
	var selector *metav1.LabelSelector
	includeMatchingServices := true
	result := make([]common.RelatedResource, 0)

	switch res := resource.(type) {
	case *corev1.Pod:
		podSpec = &corev1.PodTemplateSpec{
			Spec: res.Spec,
		}
		// For pods, use the labels as selector
		if res.Labels != nil {
			selector = &metav1.LabelSelector{
				MatchLabels: res.Labels,
			}
		}
	case *appsv1.Deployment:
		podSpec = &res.Spec.Template
		selector = res.Spec.Selector
		includeMatchingServices = false
		related, err := discoverDeploymentReferencedBy(ctx, cs.K8sClient, res)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to discover deployment related resources: " + err.Error()})
			return
		}
		result = append(result, related...)
	case *appsv1.StatefulSet:
		podSpec = &res.Spec.Template
		selector = res.Spec.Selector
	case *appsv1.DaemonSet:
		podSpec = &res.Spec.Template
		selector = res.Spec.Selector
	case *corev1.Service:
		relatedPods := discoverPodsByService(ctx, cs.K8sClient, res)
		result = append(result, relatedPods...)
	case *corev1.ConfigMap, *corev1.Secret, *corev1.PersistentVolumeClaim:
		if workloads, err := discoveryWorkloads(ctx, cs.K8sClient, namespace, name, resourceType); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to discover workloads: " + err.Error()})
			return
		} else {
			if resourceType == "persistentvolumeclaims" {
				result = append(result, common.RelatedResource{
					Type:      "persistentvolumes",
					Name:      res.(*corev1.PersistentVolumeClaim).Spec.VolumeName,
					Direction: common.RelatedDirectionReferences,
					Reason:    "bound persistent volume",
				})
			}
			result = append(result, workloads...)
		}
	case *gatewayapiv1.HTTPRoute:
		result = getHTTPRouteRelatedResouces(res, namespace)
	case *autoscalingv2.HorizontalPodAutoscaler:
		result = getAutoScalingRelatedResources(res, namespace)
	case *v1.Ingress:
		services := discoverIngressServices(namespace, res)
		result = append(result, services...)
	}

	if podSpec != nil && selector != nil {
		// discoverServices (I/O) and discoverConfigs (CPU-only) are independent;
		// run them in parallel so the I/O overlaps with the CPU work.
		g, gctx := errgroup.WithContext(ctx)

		var relatedServices []common.RelatedResource
		if includeMatchingServices {
			g.Go(func() error {
				var err error
				relatedServices, err = discoverServices(gctx, cs.K8sClient, namespace, selector)
				return err
			})
		}

		var related []common.RelatedResource
		g.Go(func() error {
			related = discoverConfigs(namespace, podSpec)
			return nil
		})

		if err := g.Wait(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to discover services: " + err.Error()})
			return
		}

		result = append(result, relatedServices...)
		result = append(result, related...)
	}

	if v, ok := resource.(client.Object); ok {
		for _, owner := range v.GetOwnerReferences() {
			if owner.Kind == "ReplicaSet" {
				// get the owner of the ReplicaSet
				rs := &appsv1.ReplicaSet{}
				if err := cs.K8sClient.Get(ctx, client.ObjectKey{Namespace: v.GetNamespace(), Name: owner.Name}, rs); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get ReplicaSet owner: " + err.Error()})
					return
				}
				if len(rs.OwnerReferences) > 0 {
					for _, rsOwner := range rs.OwnerReferences {
						result = append(result, common.RelatedResource{
							Type:       strings.ToLower(rsOwner.Kind) + "s",
							Name:       rsOwner.Name,
							Namespace:  v.GetNamespace(),
							APIVersion: rsOwner.APIVersion,
							Direction:  common.RelatedDirectionReferences,
							Reason:     "owner reference",
						})
					}
				}
			}
			result = append(result, common.RelatedResource{
				Type:       strings.ToLower(owner.Kind) + "s",
				Name:       owner.Name,
				Namespace:  v.GetNamespace(),
				APIVersion: owner.APIVersion,
				Direction:  common.RelatedDirectionReferences,
				Reason:     "owner reference",
			})
		}
	}

	c.JSON(http.StatusOK, result)
}

func getHTTPRouteRelatedResouces(res *gatewayapiv1.HTTPRoute, namespace string) []common.RelatedResource {
	var result []common.RelatedResource
	for _, parentRef := range res.Spec.ParentRefs {
		var parentResourceType string
		if parentRef.Kind != nil && *parentRef.Kind != "" {
			parentResourceType = strings.ToLower(string(*parentRef.Kind)) + "s"
		} else {
			parentResourceType = "gateways"
		}
		result = append(result, common.RelatedResource{
			Type: parentResourceType,
			Name: string(parentRef.Name),
			Namespace: func() string {
				if parentRef.Namespace != nil && *parentRef.Namespace != "" {
					return string(*parentRef.Namespace)
				}
				return namespace
			}(),
			APIVersion: gatewayapiv1.GroupVersion.String(),
			Direction:  common.RelatedDirectionReferences,
			Reason:     "httproute parent reference",
		})
	}

	for _, rule := range res.Spec.Rules {
		for _, backend := range rule.BackendRefs {
			var backendType, apiVersion string
			if backend.Kind != nil && *backend.Kind != "" {
				backendType = strings.ToLower(string(*backend.Kind)) + "s"
			} else {
				backendType = "services"
			}
			if backendType == "services" {
				apiVersion = corev1.SchemeGroupVersion.String()
			}
			result = append(result, common.RelatedResource{
				Type: backendType,
				Name: string(backend.Name),
				Namespace: func() string {
					if backend.Namespace != nil && *backend.Namespace != "" {
						return string(*backend.Namespace)
					}
					return namespace
				}(),
				APIVersion: apiVersion,
				Direction:  common.RelatedDirectionReferences,
				Reason:     "httproute backend reference",
			})
		}
	}
	return result
}

func getAutoScalingRelatedResources(res *autoscalingv2.HorizontalPodAutoscaler, namespace string) []common.RelatedResource {
	var result []common.RelatedResource
	scaleTarget := res.Spec.ScaleTargetRef
	result = append(result, common.RelatedResource{
		Type:       strings.ToLower(scaleTarget.Kind) + "s",
		APIVersion: scaleTarget.APIVersion,
		Name:       scaleTarget.Name,
		Namespace:  namespace,
		Direction:  common.RelatedDirectionReferences,
		Reason:     "scale target",
	})
	return result
}
