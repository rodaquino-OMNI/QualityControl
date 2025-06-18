# AUSTA Cockpit Terraform Outputs
# Defines outputs for use by other systems and modules

# Environment Information
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "cloud_provider" {
  description = "Cloud provider used"
  value       = var.cloud_provider
}

output "region" {
  description = "Deployment region"
  value       = var.region
}

# Network Configuration
output "vpc_id" {
  description = "VPC ID"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].vpc_id, "") :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].vpc_id, "") :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].vpc_id, "") :
    ""
  )
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = var.vpc_cidr
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].public_subnet_ids, []) :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].public_subnet_ids, []) :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].public_subnet_ids, []) :
    []
  )
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].private_subnet_ids, []) :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].private_subnet_ids, []) :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].private_subnet_ids, []) :
    []
  )
}

output "database_subnet_ids" {
  description = "Database subnet IDs"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].database_subnet_ids, []) :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].database_subnet_ids, []) :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].database_subnet_ids, []) :
    []
  )
}

# Kubernetes Cluster Information
output "cluster_name" {
  description = "Kubernetes cluster name"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_name, "") :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_name, "") :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_name, "") :
    ""
  )
}

output "cluster_endpoint" {
  description = "Kubernetes cluster endpoint"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_endpoint, "") :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_endpoint, "") :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_endpoint, "") :
    ""
  )
  sensitive = true
}

output "cluster_ca_certificate" {
  description = "Kubernetes cluster CA certificate"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_ca_certificate, "") :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_ca_certificate, "") :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_ca_certificate, "") :
    ""
  )
  sensitive = true
}

output "cluster_token" {
  description = "Kubernetes cluster authentication token"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_token, "") :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_token, "") :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_token, "") :
    ""
  )
  sensitive = true
}

# Database Endpoints
output "database_endpoints" {
  description = "Database connection endpoints"
  value = {
    postgres = (
      var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].database_endpoints.postgres, "") :
      var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].database_endpoints.postgres, "") :
      var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].database_endpoints.postgres, "") :
      ""
    )
    mongodb = (
      var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].database_endpoints.mongodb, "") :
      var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].database_endpoints.mongodb, "") :
      var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].database_endpoints.mongodb, "") :
      ""
    )
    redis = (
      var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].database_endpoints.redis, "") :
      var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].database_endpoints.redis, "") :
      var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].database_endpoints.redis, "") :
      ""
    )
  }
  sensitive = true
}

output "database_ports" {
  description = "Database connection ports"
  value = {
    postgres = 5432
    mongodb  = 27017
    redis    = 6379
  }
}

# Load Balancer Information
output "load_balancer_dns" {
  description = "Load balancer DNS name"
  value = try(module.ingress.load_balancer_dns, "")
}

output "load_balancer_ip" {
  description = "Load balancer IP address"
  value = try(module.ingress.load_balancer_ip, "")
}

output "application_url" {
  description = "Application URL"
  value = var.app_domain != "" ? "https://${var.app_domain}" : try(module.ingress.load_balancer_dns, "")
}

# Security Information
output "security_group_ids" {
  description = "Security group IDs"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].security_group_ids, {}) :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].security_group_ids, {}) :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].security_group_ids, {}) :
    {}
  )
}

output "kms_key_id" {
  description = "KMS key ID for encryption"
  value = try(module.security.kms_key_id, "")
  sensitive = true
}

output "secrets_manager_arn" {
  description = "Secrets manager ARN"
  value = try(module.security.secrets_manager_arn, "")
}

# Monitoring Information
output "monitoring_endpoints" {
  description = "Monitoring service endpoints"
  value = {
    prometheus  = try(module.monitoring.prometheus_endpoint, "")
    grafana     = try(module.monitoring.grafana_endpoint, "")
    alertmanager = try(module.monitoring.alertmanager_endpoint, "")
  }
}

output "monitoring_dashboards" {
  description = "Monitoring dashboard URLs"
  value = {
    grafana_admin_url = try(module.monitoring.grafana_admin_url, "")
    prometheus_url    = try(module.monitoring.prometheus_url, "")
  }
}

# Application Information
output "application_namespaces" {
  description = "Kubernetes namespaces for applications"
  value = try(module.application.namespaces, [])
}

output "application_services" {
  description = "Application service endpoints"
  value = try(module.application.service_endpoints, {})
}

# Backup Information
output "backup_configuration" {
  description = "Backup configuration details"
  value = {
    retention_days = var.backup_retention_days
    schedule      = var.backup_schedule
    cross_region  = var.enable_cross_region_backup
    dr_region     = var.dr_region
  }
}

# Cost Information
output "cost_optimization" {
  description = "Cost optimization settings"
  value = {
    spot_instances_enabled = var.enable_spot_instances
    autoscaling_enabled   = var.autoscaling_enabled
    min_replicas         = var.autoscaling_min_replicas
    max_replicas         = var.autoscaling_max_replicas
  }
}

# Compliance Information
output "compliance_configuration" {
  description = "Compliance framework configuration"
  value = {
    enabled_frameworks = var.compliance_frameworks
    logging_enabled    = var.enable_compliance_logging
  }
}

# Kubeconfig for kubectl access
output "kubeconfig" {
  description = "Kubernetes configuration for kubectl"
  value = (
    var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].kubeconfig, "") :
    var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].kubeconfig, "") :
    var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].kubeconfig, "") :
    ""
  )
  sensitive = true
}

# Environment-specific outputs
output "environment_specific" {
  description = "Environment-specific configuration"
  value = {
    is_production     = var.environment == "production"
    multi_az_enabled  = var.environment == "production"
    backup_enabled    = var.environment == "production"
    monitoring_level  = var.environment == "production" ? "detailed" : "basic"
    ssl_enabled      = var.environment != "development"
  }
}

# Resource Limits
output "resource_configuration" {
  description = "Resource limits and requests"
  value = var.resource_limits
}

# Scaling Configuration
output "scaling_configuration" {
  description = "Auto-scaling configuration"
  value = {
    enabled           = var.autoscaling_enabled
    min_replicas     = var.autoscaling_min_replicas
    max_replicas     = var.autoscaling_max_replicas
    target_cpu       = var.autoscaling_target_cpu
    target_memory    = var.autoscaling_target_memory
  }
}

# Disaster Recovery
output "disaster_recovery" {
  description = "Disaster recovery configuration"
  value = {
    rpo_hours               = var.rpo_hours
    rto_hours              = var.rto_hours
    cross_region_enabled   = var.enable_cross_region_backup
    dr_region             = var.dr_region
  }
}

# Summary Output
output "deployment_summary" {
  description = "Complete deployment summary"
  value = {
    environment      = var.environment
    cloud_provider   = var.cloud_provider
    region          = var.region
    cluster_name    = (
      var.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_name, "") :
      var.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_name, "") :
      var.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_name, "") :
      ""
    )
    application_url = var.app_domain != "" ? "https://${var.app_domain}" : try(module.ingress.load_balancer_dns, "")
    monitoring_url  = try(module.monitoring.grafana_endpoint, "")
    backup_enabled  = var.environment == "production"
    ssl_enabled     = var.environment != "development"
    waf_enabled     = var.enable_waf
    autoscaling     = var.autoscaling_enabled
  }
}