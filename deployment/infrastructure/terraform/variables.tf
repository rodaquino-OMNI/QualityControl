# AUSTA Cockpit Terraform Variables
# Defines all configurable parameters for infrastructure deployment

# Environment Configuration
variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production."
  }
}

variable "cloud_provider" {
  description = "Cloud provider (aws, gcp, azure)"
  type        = string
  default     = "aws"
  validation {
    condition     = contains(["aws", "gcp", "azure"], var.cloud_provider)
    error_message = "Cloud provider must be one of: aws, gcp, azure."
  }
}

variable "region" {
  description = "Cloud provider region"
  type        = string
  default     = "us-east-1"
}

# GCP specific variables
variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
  default     = ""
}

# Azure specific variables
variable "azure_resource_group" {
  description = "Azure Resource Group name"
  type        = string
  default     = ""
}

# Networking Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access the infrastructure"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage for PostgreSQL database (GB)"
  type        = number
  default     = 100
}

variable "mongodb_cluster_tier" {
  description = "MongoDB cluster tier"
  type        = string
  default     = "M10"
}

variable "mongodb_disk_size" {
  description = "MongoDB disk size (GB)"
  type        = number
  default     = 50
}

variable "redis_node_type" {
  description = "Redis node type"
  type        = string
  default     = "cache.t3.medium"
}

# Kubernetes Configuration
variable "k8s_cluster_version" {
  description = "Kubernetes cluster version"
  type        = string
  default     = "1.28"
}

variable "k8s_node_instance_types" {
  description = "EC2 instance types for general Kubernetes nodes"
  type        = list(string)
  default     = ["t3.large"]
}

variable "k8s_ai_instance_types" {
  description = "EC2 instance types for AI workload nodes"
  type        = list(string)
  default     = ["g4dn.xlarge"]
}

variable "k8s_min_nodes" {
  description = "Minimum number of Kubernetes nodes"
  type        = number
  default     = 2
}

variable "k8s_max_nodes" {
  description = "Maximum number of Kubernetes nodes"
  type        = number
  default     = 10
}

variable "k8s_desired_nodes" {
  description = "Desired number of Kubernetes nodes"
  type        = number
  default     = 3
}

variable "k8s_ai_max_nodes" {
  description = "Maximum number of AI workload nodes"
  type        = number
  default     = 5
}

# Application Configuration
variable "app_version" {
  description = "Application version to deploy"
  type        = string
  default     = "latest"
}

variable "app_domain" {
  description = "Application domain name"
  type        = string
  default     = ""
}

variable "ssl_cert_arn" {
  description = "SSL certificate ARN (AWS) or equivalent"
  type        = string
  default     = ""
}

# Resource Limits
variable "resource_limits" {
  description = "Resource limits for application components"
  type = object({
    frontend = object({
      cpu    = string
      memory = string
    })
    backend = object({
      cpu    = string
      memory = string
    })
    ai_service = object({
      cpu    = string
      memory = string
    })
  })
  default = {
    frontend = {
      cpu    = "500m"
      memory = "512Mi"
    }
    backend = {
      cpu    = "1000m"
      memory = "1Gi"
    }
    ai_service = {
      cpu    = "2000m"
      memory = "4Gi"
    }
  }
}

# Security Configuration
variable "enable_waf" {
  description = "Enable Web Application Firewall"
  type        = bool
  default     = true
}

variable "enable_secrets_manager" {
  description = "Enable secrets manager service"
  type        = bool
  default     = true
}

variable "enable_kms" {
  description = "Enable Key Management Service"
  type        = bool
  default     = true
}

variable "rate_limit_requests_per_minute" {
  description = "Rate limit for requests per minute"
  type        = number
  default     = 1000
}

# Monitoring Configuration
variable "prometheus_retention" {
  description = "Prometheus data retention period"
  type        = string
  default     = "30d"
}

variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "alertmanager_config" {
  description = "Alertmanager configuration"
  type = object({
    slack_webhook_url = string
    pagerduty_key    = string
    email_recipients = list(string)
  })
  default = {
    slack_webhook_url = ""
    pagerduty_key    = ""
    email_recipients = []
  }
}

# Backup Configuration
variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 30
}

variable "backup_schedule" {
  description = "Backup schedule (cron format)"
  type        = string
  default     = "0 2 * * *"
}

# Scaling Configuration
variable "autoscaling_enabled" {
  description = "Enable application autoscaling"
  type        = bool
  default     = true
}

variable "autoscaling_min_replicas" {
  description = "Minimum number of application replicas"
  type        = number
  default     = 2
}

variable "autoscaling_max_replicas" {
  description = "Maximum number of application replicas"
  type        = number
  default     = 50
}

variable "autoscaling_target_cpu" {
  description = "Target CPU utilization percentage for autoscaling"
  type        = number
  default     = 60
}

variable "autoscaling_target_memory" {
  description = "Target memory utilization percentage for autoscaling"
  type        = number
  default     = 70
}

# Compliance Configuration
variable "enable_compliance_logging" {
  description = "Enable compliance logging and auditing"
  type        = bool
  default     = true
}

variable "compliance_frameworks" {
  description = "List of compliance frameworks to adhere to"
  type        = list(string)
  default     = ["SOC2", "HIPAA", "GDPR"]
}

# Disaster Recovery Configuration
variable "enable_cross_region_backup" {
  description = "Enable cross-region backup replication"
  type        = bool
  default     = false
}

variable "dr_region" {
  description = "Disaster recovery region"
  type        = string
  default     = ""
}

variable "rpo_hours" {
  description = "Recovery Point Objective in hours"
  type        = number
  default     = 1
}

variable "rto_hours" {
  description = "Recovery Time Objective in hours"
  type        = number
  default     = 4
}

# Cost Optimization
variable "enable_spot_instances" {
  description = "Enable spot instances for cost optimization (non-production)"
  type        = bool
  default     = false
}

variable "spot_instance_types" {
  description = "Instance types to use for spot instances"
  type        = list(string)
  default     = ["t3.large", "t3.xlarge", "m5.large"]
}

# Development Configuration
variable "enable_development_tools" {
  description = "Enable development and debugging tools"
  type        = bool
  default     = false
}

variable "development_tools" {
  description = "List of development tools to install"
  type        = list(string)
  default     = ["kubectl", "helm", "k9s", "lens"]
}