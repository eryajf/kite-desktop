package ai

import (
	"context"
	"reflect"
	"testing"

	"github.com/eryajf/kite-desktop/pkg/cluster"
)

func TestPermissionNamespace(t *testing.T) {
	tests := []struct {
		name      string
		resource  resourceInfo
		namespace string
		want      string
	}{
		{
			name:      "cluster scoped ignores namespace",
			resource:  resourceInfo{ClusterScoped: true},
			namespace: "default",
			want:      "",
		},
		{
			name:      "namespaced empty becomes all",
			resource:  resourceInfo{},
			namespace: " ",
			want:      "_all",
		},
		{
			name:      "namespaced passes through",
			resource:  resourceInfo{},
			namespace: " default ",
			want:      "default",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := permissionNamespace(tc.resource, tc.namespace); got != tc.want {
				t.Fatalf("unexpected namespace: want %q, got %q", tc.want, got)
			}
		})
	}
}

func TestRequiredToolPermissions(t *testing.T) {
	tests := []struct {
		name     string
		toolName string
		args     map[string]interface{}
		want     []toolPermission
	}{
		{
			name:     "get resource",
			toolName: "get_resource",
			args: map[string]interface{}{
				"kind":      "pods",
				"namespace": "default",
			},
			want: []toolPermission{{Resource: "pods", Verb: "get", Namespace: "default"}},
		},
		{
			name:     "list resources across namespaces",
			toolName: "list_resources",
			args: map[string]interface{}{
				"kind": "Deployment",
			},
			want: []toolPermission{{Resource: "deployments", Verb: "get", Namespace: "_all"}},
		},
		{
			name:     "get pod logs",
			toolName: "get_pod_logs",
			args: map[string]interface{}{
				"name":      "nginx",
				"namespace": "default",
			},
			want: []toolPermission{{Resource: "pods", Verb: "log", Namespace: "default"}},
		},
		{
			name:     "cluster overview",
			toolName: "get_cluster_overview",
			args:     map[string]interface{}{},
			want: []toolPermission{
				{Resource: "nodes", Verb: "get", Namespace: ""},
				{Resource: "pods", Verb: "get", Namespace: "_all"},
				{Resource: "namespaces", Verb: "get", Namespace: ""},
				{Resource: "services", Verb: "get", Namespace: "_all"},
			},
		},
		{
			name:     "create namespaced resource",
			toolName: "create_resource",
			args: map[string]interface{}{
				"yaml": "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: example\n  namespace: default\n",
			},
			want: []toolPermission{{Resource: "configmaps", Verb: "create", Namespace: "default"}},
		},
		{
			name:     "create cluster scoped resource",
			toolName: "create_resource",
			args: map[string]interface{}{
				"yaml": "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: example\n",
			},
			want: []toolPermission{{Resource: "namespaces", Verb: "create", Namespace: ""}},
		},
		{
			name:     "patch cluster scoped resource",
			toolName: "patch_resource",
			args: map[string]interface{}{
				"kind":      "Node",
				"name":      "node-1",
				"namespace": "default",
				"patch":     `{"metadata":{"labels":{"env":"prod"}}}`,
			},
			want: []toolPermission{{Resource: "nodes", Verb: "update", Namespace: ""}},
		},
		{
			name:     "delete resource",
			toolName: "delete_resource",
			args: map[string]interface{}{
				"kind":      "Service",
				"name":      "api",
				"namespace": "default",
			},
			want: []toolPermission{{Resource: "services", Verb: "delete", Namespace: "default"}},
		},
		{
			name:     "prometheus query",
			toolName: "query_prometheus",
			args:     map[string]interface{}{"query": "up"},
			want:     []toolPermission{{Resource: "pods", Verb: "get", Namespace: "_all"}},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := requiredToolPermissions(context.Background(), &cluster.ClientSet{}, tc.toolName, tc.args)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("unexpected permissions:\nwant: %#v\ngot:  %#v", tc.want, got)
			}
		})
	}
}
