package cluster

import (
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/eryajf/kite-desktop/pkg/common"
	"github.com/eryajf/kite-desktop/pkg/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"k8s.io/client-go/tools/clientcmd"
)

type clusterRequest struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	Config        string `json:"config"`
	PrometheusURL string `json:"prometheusURL"`
	InCluster     bool   `json:"inCluster"`
	IsDefault     bool   `json:"isDefault"`
	Enabled       bool   `json:"enabled"`
}

var clusterConnectionTester = validateClusterConnection

func (cm *ClusterManager) GetClusters(c *gin.Context) {
	result := make([]common.ClusterInfo, 0, len(cm.clusters))
	for name, cluster := range cm.clusters {
		result = append(result, common.ClusterInfo{
			Name:      name,
			Version:   cluster.Version,
			IsDefault: name == cm.defaultContext,
		})
	}
	for name, errMsg := range cm.errors {
		result = append(result, common.ClusterInfo{
			Name:      name,
			Version:   "",
			IsDefault: false,
			Error:     errMsg,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	c.JSON(200, result)
}

func (cm *ClusterManager) GetClusterList(c *gin.Context) {
	clusters, err := model.ListClusters()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]gin.H, 0, len(clusters))
	for _, cluster := range clusters {
		clusterInfo := gin.H{
			"id":            cluster.ID,
			"name":          cluster.Name,
			"description":   cluster.Description,
			"enabled":       cluster.Enable,
			"inCluster":     cluster.InCluster,
			"isDefault":     cluster.IsDefault,
			"prometheusURL": cluster.PrometheusURL,
			"config":        "",
		}

		if clientSet, exists := cm.clusters[cluster.Name]; exists {
			clusterInfo["version"] = clientSet.Version
		}
		if errMsg, exists := cm.errors[cluster.Name]; exists {
			clusterInfo["error"] = errMsg
		}

		result = append(result, clusterInfo)
	}

	c.JSON(http.StatusOK, result)
}

func (cm *ClusterManager) CreateCluster(c *gin.Context) {
	var req clusterRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	if _, err := model.GetClusterByName(req.Name); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "cluster already exists"})
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.IsDefault {
		if err := model.ClearDefaultCluster(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	cluster := &model.Cluster{
		Name:          req.Name,
		Description:   req.Description,
		Config:        model.SecretString(req.Config),
		PrometheusURL: req.PrometheusURL,
		InCluster:     req.InCluster,
		IsDefault:     req.IsDefault,
		Enable:        true,
	}

	if err := model.AddCluster(cluster); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	syncNow <- struct{}{}

	c.JSON(http.StatusCreated, gin.H{
		"id":      cluster.ID,
		"message": "cluster created successfully",
	})
}

func (cm *ClusterManager) UpdateCluster(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid cluster id"})
		return
	}

	var req clusterRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cluster, err := model.GetClusterByID(uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "cluster not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	if req.IsDefault && !cluster.IsDefault {
		if err := model.ClearDefaultCluster(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	updates := map[string]interface{}{
		"description":    req.Description,
		"prometheus_url": req.PrometheusURL,
		"in_cluster":     req.InCluster,
		"is_default":     req.IsDefault,
		"enable":         req.Enabled,
	}

	if req.Name != "" && req.Name != cluster.Name {
		updates["name"] = req.Name
	}

	if req.Config != "" {
		updates["config"] = model.SecretString(req.Config)
	}

	if err := model.UpdateCluster(cluster, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	syncNow <- struct{}{}

	c.JSON(http.StatusOK, gin.H{"message": "cluster updated successfully"})
}

func (cm *ClusterManager) DeleteCluster(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid cluster id"})
		return
	}

	cluster, err := model.GetClusterByID(uint(id))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "cluster not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	if cluster.IsDefault {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete default cluster"})
		return
	}

	if err := model.DeleteCluster(cluster); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	syncNow <- struct{}{}

	c.JSON(http.StatusOK, gin.H{"message": "cluster deleted successfully"})
}

func validateClusterConnection(cluster *model.Cluster) (*ClientSet, error) {
	cs, err := buildClientSet(cluster)
	if err != nil {
		return nil, err
	}
	if cs == nil || cs.K8sClient == nil || cs.K8sClient.ClientSet == nil {
		return nil, errors.New("cluster client is not initialized")
	}

	version, err := cs.K8sClient.ClientSet.Discovery().ServerVersion()
	if err != nil {
		cs.K8sClient.Stop(cluster.Name)
		return nil, err
	}

	cs.Version = version.String()
	return cs, nil
}

func (cm *ClusterManager) TestClusterConnection(c *gin.Context) {
	var req clusterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config := strings.TrimSpace(req.Config)
	if !req.InCluster && config == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "config is required when inCluster is false"})
		return
	}

	clusterName := strings.TrimSpace(req.Name)
	if clusterName == "" {
		clusterName = "test-connection"
	}

	cluster := &model.Cluster{
		Name:          clusterName,
		Config:        model.SecretString(config),
		PrometheusURL: strings.TrimSpace(req.PrometheusURL),
		InCluster:     req.InCluster,
	}

	cs, err := clusterConnectionTester(cluster)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if cs != nil && cs.K8sClient != nil {
		defer cs.K8sClient.Stop(cluster.Name)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "cluster connection successful",
		"version": cs.Version,
	})
}

func (cm *ClusterManager) ImportClustersFromKubeconfig(c *gin.Context) {
	var clusterReq common.ImportClustersRequest
	if err := c.ShouldBindJSON(&clusterReq); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !clusterReq.InCluster && clusterReq.Config == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "config is required when inCluster is false"})
		return
	}

	cc, err := model.CountClusters()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cc > 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "import not allowed when clusters exist"})
		return
	}

	if clusterReq.InCluster {
		// In-cluster config
		cluster := &model.Cluster{
			Name:        "in-cluster",
			InCluster:   true,
			Description: "Kubernetes in-cluster config",
			IsDefault:   true,
			Enable:      true,
		}
		if err := model.AddCluster(cluster); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		syncNow <- struct{}{}
		// wait for sync to complete
		time.Sleep(1 * time.Second)
		c.JSON(http.StatusCreated, gin.H{"message": fmt.Sprintf("imported %d clusters successfully", 1)})
		return
	}

	kubeconfig, err := clientcmd.Load([]byte(clusterReq.Config))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	importedCount := ImportClustersFromKubeconfig(kubeconfig)
	syncNow <- struct{}{}
	// wait for sync to complete
	time.Sleep(1 * time.Second)
	c.JSON(http.StatusCreated, gin.H{"message": fmt.Sprintf("imported %d clusters successfully", importedCount)})
}
