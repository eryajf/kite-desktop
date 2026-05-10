package resources

import (
	"context"
	"reflect"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/kube"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	gatewayapiv1 "sigs.k8s.io/gateway-api/apis/v1"
)

func TestDiscoverIngressServices(t *testing.T) {
	ingress := &networkingv1.Ingress{
		Spec: networkingv1.IngressSpec{
			Rules: []networkingv1.IngressRule{
				{
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: []networkingv1.HTTPIngressPath{
								{Backend: networkingv1.IngressBackend{Service: &networkingv1.IngressServiceBackend{Name: "svc-a"}}},
								{Backend: networkingv1.IngressBackend{Service: &networkingv1.IngressServiceBackend{Name: "svc-b"}}},
								{Backend: networkingv1.IngressBackend{Service: &networkingv1.IngressServiceBackend{Name: "svc-a"}}},
							},
						},
					},
				},
				{},
			},
			DefaultBackend: &networkingv1.IngressBackend{
				Service: &networkingv1.IngressServiceBackend{Name: "svc-b"},
			},
		},
	}

	got := discoverIngressServices("default", ingress)
	want := []common.RelatedResource{
		{Type: "services", Namespace: "default", Name: "svc-a", APIVersion: corev1.SchemeGroupVersion.String(), Direction: common.RelatedDirectionReferences, Reason: "ingress backend service"},
		{Type: "services", Namespace: "default", Name: "svc-b", APIVersion: corev1.SchemeGroupVersion.String(), Direction: common.RelatedDirectionReferences, Reason: "ingress backend service"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("discoverIngressServices() = %#v, want %#v", got, want)
	}
}

func TestDiscoverConfigs(t *testing.T) {
	podSpec := &corev1.PodTemplateSpec{
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name: "app",
					Env: []corev1.EnvVar{
						{ValueFrom: &corev1.EnvVarSource{ConfigMapKeyRef: &corev1.ConfigMapKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: "cm-env"}, Key: "key"}}},
						{ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: "sec-env"}, Key: "key"}}},
					},
					EnvFrom: []corev1.EnvFromSource{
						{ConfigMapRef: &corev1.ConfigMapEnvSource{LocalObjectReference: corev1.LocalObjectReference{Name: "cm-from"}}},
						{SecretRef: &corev1.SecretEnvSource{LocalObjectReference: corev1.LocalObjectReference{Name: "sec-from"}}},
					},
				},
			},
			Volumes: []corev1.Volume{
				{VolumeSource: corev1.VolumeSource{ConfigMap: &corev1.ConfigMapVolumeSource{LocalObjectReference: corev1.LocalObjectReference{Name: "cm-vol"}}}},
				{VolumeSource: corev1.VolumeSource{Secret: &corev1.SecretVolumeSource{SecretName: "sec-vol"}}},
				{VolumeSource: corev1.VolumeSource{PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "pvc-vol"}}},
			},
		},
	}

	got := discoverConfigs("default", podSpec)
	want := []common.RelatedResource{
		{Type: "configmaps", Namespace: "default", Name: "cm-env", Direction: common.RelatedDirectionReferences, Reason: "pod template reference"},
		{Type: "configmaps", Namespace: "default", Name: "cm-from", Direction: common.RelatedDirectionReferences, Reason: "pod template reference"},
		{Type: "configmaps", Namespace: "default", Name: "cm-vol", Direction: common.RelatedDirectionReferences, Reason: "pod template reference"},
		{Type: "secrets", Namespace: "default", Name: "sec-env", Direction: common.RelatedDirectionReferences, Reason: "pod template reference"},
		{Type: "secrets", Namespace: "default", Name: "sec-from", Direction: common.RelatedDirectionReferences, Reason: "pod template reference"},
		{Type: "secrets", Namespace: "default", Name: "sec-vol", Direction: common.RelatedDirectionReferences, Reason: "pod template reference"},
		{Type: "persistentvolumeclaims", Namespace: "default", Name: "pvc-vol", Direction: common.RelatedDirectionReferences, Reason: "pod template volume claim"},
	}
	if !sameRelatedResources(got, want) {
		t.Fatalf("discoverConfigs() = %#v, want %#v", got, want)
	}
}

func TestCheckInUsedConfigs(t *testing.T) {
	podSpec := &corev1.PodTemplateSpec{
		Spec: corev1.PodSpec{
			InitContainers: []corev1.Container{
				{
					Name: "init",
					Env: []corev1.EnvVar{
						{ValueFrom: &corev1.EnvVarSource{ConfigMapKeyRef: &corev1.ConfigMapKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: "cm-init"}, Key: "key"}}},
					},
				},
			},
			Containers: []corev1.Container{
				{
					Name: "app",
					Env: []corev1.EnvVar{
						{ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: "sec-env"}, Key: "key"}}},
					},
					EnvFrom: []corev1.EnvFromSource{
						{ConfigMapRef: &corev1.ConfigMapEnvSource{LocalObjectReference: corev1.LocalObjectReference{Name: "cm-from"}}},
					},
				},
			},
			Volumes: []corev1.Volume{
				{VolumeSource: corev1.VolumeSource{PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "pvc-vol"}}},
			},
		},
	}

	tests := []struct {
		name         string
		resourceType string
		resourceName string
		want         bool
	}{
		{name: "configmap from init env", resourceType: "configmaps", resourceName: "cm-init", want: true},
		{name: "configmap from envFrom", resourceType: "configmaps", resourceName: "cm-from", want: true},
		{name: "secret from env", resourceType: "secrets", resourceName: "sec-env", want: true},
		{name: "pvc from volume", resourceType: "persistentvolumeclaims", resourceName: "pvc-vol", want: true},
		{name: "missing configmap", resourceType: "configmaps", resourceName: "missing", want: false},
		{name: "nil spec", resourceType: "secrets", resourceName: "sec-env", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spec := podSpec
			if tt.name == "nil spec" {
				spec = nil
			}
			if got := checkInUsedConfigs(spec, tt.resourceName, tt.resourceType); got != tt.want {
				t.Fatalf("checkInUsedConfigs() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetHTTPRouteRelatedResources(t *testing.T) {
	parentKind := gatewayapiv1.Kind("Gateway")
	backendKind := gatewayapiv1.Kind("ConfigMap")
	parentNamespace := gatewayapiv1.Namespace("edge")
	backendNamespace := gatewayapiv1.Namespace("apps")

	route := &gatewayapiv1.HTTPRoute{
		Spec: gatewayapiv1.HTTPRouteSpec{
			CommonRouteSpec: gatewayapiv1.CommonRouteSpec{
				ParentRefs: []gatewayapiv1.ParentReference{
					{Name: gatewayapiv1.ObjectName("gw-a")},
					{Name: gatewayapiv1.ObjectName("gw-b"), Kind: &parentKind, Namespace: &parentNamespace},
				},
			},
			Rules: []gatewayapiv1.HTTPRouteRule{
				{
					BackendRefs: []gatewayapiv1.HTTPBackendRef{
						{
							BackendRef: gatewayapiv1.BackendRef{
								BackendObjectReference: gatewayapiv1.BackendObjectReference{
									Name: gatewayapiv1.ObjectName("svc-a"),
								},
							},
						},
						{
							BackendRef: gatewayapiv1.BackendRef{
								BackendObjectReference: gatewayapiv1.BackendObjectReference{
									Name:      gatewayapiv1.ObjectName("cfg"),
									Kind:      &backendKind,
									Namespace: &backendNamespace,
								},
							},
						},
					},
				},
			},
		},
	}

	got := getHTTPRouteRelatedResouces(route, "default")
	want := []common.RelatedResource{
		{Type: "gateways", Name: "gw-a", Namespace: "default", APIVersion: gatewayapiv1.GroupVersion.String(), Direction: common.RelatedDirectionReferences, Reason: "httproute parent reference"},
		{Type: "gateways", Name: "gw-b", Namespace: "edge", APIVersion: gatewayapiv1.GroupVersion.String(), Direction: common.RelatedDirectionReferences, Reason: "httproute parent reference"},
		{Type: "services", Name: "svc-a", Namespace: "default", APIVersion: corev1.SchemeGroupVersion.String(), Direction: common.RelatedDirectionReferences, Reason: "httproute backend reference"},
		{Type: "configmaps", Name: "cfg", Namespace: "apps", Direction: common.RelatedDirectionReferences, Reason: "httproute backend reference"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("getHTTPRouteRelatedResouces() = %#v, want %#v", got, want)
	}
}

func TestGetAutoScalingRelatedResources(t *testing.T) {
	hpa := &autoscalingv2.HorizontalPodAutoscaler{
		Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
			ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
				Kind:       "Deployment",
				APIVersion: "apps/v1",
				Name:       "demo",
			},
		},
	}

	got := getAutoScalingRelatedResources(hpa, "default")
	want := []common.RelatedResource{
		{Type: "deployments", APIVersion: "apps/v1", Name: "demo", Namespace: "default", Direction: common.RelatedDirectionReferences, Reason: "scale target"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("getAutoScalingRelatedResources() = %#v, want %#v", got, want)
	}
}

func TestDiscoverDeploymentReferencedBy(t *testing.T) {
	scheme := runtime.NewScheme()
	if err := appsv1.AddToScheme(scheme); err != nil {
		t.Fatal(err)
	}
	if err := corev1.AddToScheme(scheme); err != nil {
		t.Fatal(err)
	}
	if err := discoveryv1.AddToScheme(scheme); err != nil {
		t.Fatal(err)
	}
	if err := networkingv1.AddToScheme(scheme); err != nil {
		t.Fatal(err)
	}
	if err := autoscalingv2.AddToScheme(scheme); err != nil {
		t.Fatal(err)
	}
	if err := gatewayapiv1.Install(scheme); err != nil {
		t.Fatal(err)
	}

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo",
			Namespace: "default",
			UID:       types.UID("deployment-uid"),
		},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "demo"}},
		},
	}
	replicaSet := &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-abc",
			Namespace: "default",
			OwnerReferences: []metav1.OwnerReference{
				{APIVersion: "apps/v1", Kind: "Deployment", Name: "demo", UID: types.UID("deployment-uid")},
			},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-abc-pod",
			Namespace: "default",
			OwnerReferences: []metav1.OwnerReference{
				{APIVersion: "apps/v1", Kind: "ReplicaSet", Name: "demo-abc", UID: types.UID("rs-uid")},
			},
		},
	}
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "demo-svc", Namespace: "default"},
		Spec:       corev1.ServiceSpec{Selector: map[string]string{"app": "demo"}},
	}
	endpointSlice := &discoveryv1.EndpointSlice{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "demo-svc-abc",
			Namespace: "default",
			Labels:    map[string]string{discoveryv1.LabelServiceName: "demo-svc"},
		},
	}
	ingress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{Name: "demo-ingress", Namespace: "default"},
		Spec: networkingv1.IngressSpec{
			DefaultBackend: &networkingv1.IngressBackend{
				Service: &networkingv1.IngressServiceBackend{Name: "demo-svc"},
			},
		},
	}
	hpa := &autoscalingv2.HorizontalPodAutoscaler{
		ObjectMeta: metav1.ObjectMeta{Name: "demo-hpa", Namespace: "default"},
		Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
			ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
				Kind: "Deployment",
				Name: "demo",
			},
		},
	}
	route := &gatewayapiv1.HTTPRoute{
		ObjectMeta: metav1.ObjectMeta{Name: "demo-route", Namespace: "default"},
		Spec: gatewayapiv1.HTTPRouteSpec{
			Rules: []gatewayapiv1.HTTPRouteRule{
				{
					BackendRefs: []gatewayapiv1.HTTPBackendRef{
						{
							BackendRef: gatewayapiv1.BackendRef{
								BackendObjectReference: gatewayapiv1.BackendObjectReference{
									Name: gatewayapiv1.ObjectName("demo-svc"),
								},
							},
						},
					},
				},
			},
		},
	}
	client := &kube.K8sClient{
		Client: fake.NewClientBuilder().
			WithScheme(scheme).
			WithObjects(deployment, replicaSet, pod, service, endpointSlice, ingress, hpa, route).
			Build(),
	}

	got, err := discoverDeploymentReferencedBy(context.Background(), client, deployment)
	if err != nil {
		t.Fatal(err)
	}
	want := []common.RelatedResource{
		{Type: "replicasets", APIVersion: appsv1.SchemeGroupVersion.String(), Namespace: "default", Name: "demo-abc", Direction: common.RelatedDirectionReferencedBy, Reason: "owned by deployment"},
		{Type: "pods", Namespace: "default", Name: "demo-abc-pod", Direction: common.RelatedDirectionReferencedBy, Reason: "pod owned by deployment replica set"},
		{Type: "services", APIVersion: corev1.SchemeGroupVersion.String(), Namespace: "default", Name: "demo-svc", Direction: common.RelatedDirectionReferencedBy, Reason: "service selector matches workload pods"},
		{Type: "endpoints", APIVersion: corev1.SchemeGroupVersion.String(), Namespace: "default", Name: "demo-svc", Direction: common.RelatedDirectionReferencedBy, Reason: "service endpoint for matching selector"},
		{Type: "endpointslices", APIVersion: discoveryv1.SchemeGroupVersion.String(), Namespace: "default", Name: "demo-svc-abc", Direction: common.RelatedDirectionReferencedBy, Reason: "endpoint slice for matching service"},
		{Type: "ingresses", APIVersion: networkingv1.SchemeGroupVersion.String(), Namespace: "default", Name: "demo-ingress", Direction: common.RelatedDirectionReferencedBy, Reason: "routes traffic to matching service"},
		{Type: "httproutes", APIVersion: gatewayapiv1.GroupVersion.String(), Namespace: "default", Name: "demo-route", Direction: common.RelatedDirectionReferencedBy, Reason: "routes traffic to matching service"},
		{Type: "horizontalpodautoscalers", APIVersion: autoscalingv2.SchemeGroupVersion.String(), Namespace: "default", Name: "demo-hpa", Direction: common.RelatedDirectionReferencedBy, Reason: "scales deployment"},
	}
	if !sameRelatedResources(got, want) {
		t.Fatalf("discoverDeploymentReferencedBy() = %#v, want %#v", got, want)
	}
}

func sameRelatedResources(got []common.RelatedResource, want []common.RelatedResource) bool {
	if len(got) != len(want) {
		return false
	}
	gotMap := make(map[string]int, len(got))
	wantMap := make(map[string]int, len(want))
	for _, item := range got {
		gotMap[relatedResourceKey(item)]++
	}
	for _, item := range want {
		wantMap[relatedResourceKey(item)]++
	}
	return reflect.DeepEqual(gotMap, wantMap)
}

func relatedResourceKey(item common.RelatedResource) string {
	return item.Type + "|" + item.APIVersion + "|" + item.Name + "|" + item.Namespace
}
