package handlers

import (
	"context"
	"errors"
	"time"

	"golang.org/x/net/websocket"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/eryajf/kite-desktop/pkg/cluster"
	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/utils"
)

type terminalPodReadyMessages struct {
	Waiting string
	Ready   string
	Timeout string
}

func waitForTerminalPodReady(
	ctx context.Context,
	cs *cluster.ClientSet,
	conn *websocket.Conn,
	podName string,
	messages terminalPodReadyMessages,
	sendMessage func(*websocket.Conn, string, string),
	sendErrorMessage func(*websocket.Conn, string),
) error {
	timeout := time.After(60 * time.Second)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	sendMessage(conn, "info", messages.Waiting)

	var pod *corev1.Pod
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-timeout:
			sendMessage(conn, "info", "")
			sendErrorMessage(conn, utils.GetPodErrorMessage(pod))
			return errors.New(messages.Timeout)
		case <-ticker.C:
			var err error
			pod, err = cs.K8sClient.ClientSet.CoreV1().Pods(common.AgentPodNamespace).Get(
				ctx,
				podName,
				metav1.GetOptions{},
			)
			if err != nil {
				continue
			}
			sendMessage(conn, "stdout", ".")
			if utils.IsPodReady(pod) {
				sendMessage(conn, "info", messages.Ready)
				return nil
			}
		}
	}
}
