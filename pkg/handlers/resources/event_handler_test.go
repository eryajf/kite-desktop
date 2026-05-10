package resources

import (
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestEventResourceKindFallsBackWhenTypeMetaIsEmpty(t *testing.T) {
	tests := []struct {
		name     string
		resource string
		target   interface{}
		want     string
	}{
		{
			name:     "deployment",
			resource: "deployments",
			target: &appsv1.Deployment{
				ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default"},
			},
			want: "Deployment",
		},
		{
			name:     "statefulset",
			resource: "statefulsets",
			target: &appsv1.StatefulSet{
				ObjectMeta: metav1.ObjectMeta{Name: "db", Namespace: "default"},
			},
			want: "StatefulSet",
		},
		{
			name:     "daemonset",
			resource: "daemonsets",
			target: &appsv1.DaemonSet{
				ObjectMeta: metav1.ObjectMeta{Name: "agent", Namespace: "default"},
			},
			want: "DaemonSet",
		},
		{
			name:     "cronjob",
			resource: "cronjobs",
			target: &batchv1.CronJob{
				ObjectMeta: metav1.ObjectMeta{Name: "cleanup", Namespace: "default"},
			},
			want: "CronJob",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := eventResourceKind(tt.resource, tt.target)
			if err != nil {
				t.Fatalf("eventResourceKind returned error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("expected %s kind, got %q", tt.want, got)
			}
		})
	}
}
