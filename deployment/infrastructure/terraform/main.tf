# AUSTA Cockpit Infrastructure as Code
# Main Terraform configuration for multi-cloud deployment

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
  
  backend "s3" {
    # Configure remote state storage
    # This should be customized per environment
    bucket         = "austa-cockpit-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "austa-cockpit-terraform-locks"
  }
}

# Local variables
locals {
  environment = var.environment
  project     = "austa-cockpit"
  
  common_tags = {
    Project     = local.project
    Environment = local.environment
    ManagedBy   = "Terraform"
    Owner       = "AUSTA-DevOps"
  }
  
  # Multi-cloud configuration
  cloud_provider = var.cloud_provider
  region         = var.region
  
  # Networking
  vpc_cidr = var.vpc_cidr
  
  # Database configuration
  database_config = {
    postgres = {
      instance_class    = var.db_instance_class
      allocated_storage = var.db_allocated_storage
      multi_az         = var.environment == "production" ? true : false
      backup_retention = var.environment == "production" ? 30 : 7
    }
    mongodb = {
      cluster_tier = var.mongodb_cluster_tier
      disk_size    = var.mongodb_disk_size
      backup_enabled = var.environment == "production" ? true : false
    }
    redis = {
      node_type        = var.redis_node_type
      num_cache_nodes  = var.environment == "production" ? 3 : 1
      parameter_group  = "default.redis7"
    }
  }
  
  # Kubernetes configuration
  k8s_config = {
    cluster_version = var.k8s_cluster_version
    node_groups = {
      general = {
        instance_types = var.k8s_node_instance_types
        min_size      = var.k8s_min_nodes
        max_size      = var.k8s_max_nodes
        desired_size  = var.k8s_desired_nodes
      }
      ai_workloads = {
        instance_types = var.k8s_ai_instance_types
        min_size      = 0
        max_size      = var.k8s_ai_max_nodes
        desired_size  = var.environment == "production" ? 2 : 1
        taints = [{
          key    = "workload"
          value  = "ai"
          effect = "NO_SCHEDULE"
        }]
      }
    }
  }
}

# Data sources for availability zones
data "aws_availability_zones" "available" {
  count = local.cloud_provider == "aws" ? 1 : 0
  state = "available"
}

data "google_compute_zones" "available" {
  count  = local.cloud_provider == "gcp" ? 1 : 0
  region = local.region
}

data "azurerm_client_config" "current" {
  count = local.cloud_provider == "azure" ? 1 : 0
}

# Cloud provider modules
module "aws_infrastructure" {
  count  = local.cloud_provider == "aws" ? 1 : 0
  source = "./modules/aws"
  
  environment          = local.environment
  project             = local.project
  region              = local.region
  availability_zones  = slice(data.aws_availability_zones.available[0].names, 0, 3)
  
  # Networking
  vpc_cidr            = local.vpc_cidr
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
  
  # Database configuration
  database_config = local.database_config
  
  # Kubernetes configuration
  k8s_config = local.k8s_config
  
  tags = local.common_tags
}

module "gcp_infrastructure" {
  count  = local.cloud_provider == "gcp" ? 1 : 0
  source = "./modules/gcp"
  
  environment    = local.environment
  project       = local.project
  project_id    = var.gcp_project_id
  region        = local.region
  zones         = data.google_compute_zones.available[0].names
  
  # Networking
  vpc_cidr = local.vpc_cidr
  subnet_cidrs = {
    public   = var.public_subnet_cidrs
    private  = var.private_subnet_cidrs
    database = var.database_subnet_cidrs
  }
  
  # Database configuration
  database_config = local.database_config
  
  # Kubernetes configuration
  k8s_config = local.k8s_config
  
  labels = local.common_tags
}

module "azure_infrastructure" {
  count  = local.cloud_provider == "azure" ? 1 : 0
  source = "./modules/azure"
  
  environment       = local.environment
  project          = local.project
  location         = local.region
  resource_group   = var.azure_resource_group
  
  # Networking
  vpc_cidr = local.vpc_cidr
  subnet_cidrs = {
    public   = var.public_subnet_cidrs
    private  = var.private_subnet_cidrs
    database = var.database_subnet_cidrs
  }
  
  # Database configuration
  database_config = local.database_config
  
  # Kubernetes configuration
  k8s_config = local.k8s_config
  
  tags = local.common_tags
}

# Shared resources (monitoring, security, etc.)
module "monitoring" {
  source = "./modules/monitoring"
  
  environment     = local.environment
  cloud_provider  = local.cloud_provider
  
  # Get cluster information from cloud provider module
  cluster_name = (
    local.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_name, "") :
    local.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_name, "") :
    local.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_name, "") :
    ""
  )
  
  cluster_endpoint = (
    local.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_endpoint, "") :
    local.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_endpoint, "") :
    local.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_endpoint, "") :
    ""
  )
  
  # Monitoring configuration
  prometheus_retention = var.prometheus_retention
  grafana_admin_password = var.grafana_admin_password
  alertmanager_config = var.alertmanager_config
  
  tags = local.common_tags
}

module "security" {
  source = "./modules/security"
  
  environment    = local.environment
  cloud_provider = local.cloud_provider
  
  # Security configuration
  enable_waf           = var.enable_waf
  enable_secrets_manager = var.enable_secrets_manager
  enable_kms          = var.enable_kms
  
  # Network security
  allowed_cidr_blocks = var.allowed_cidr_blocks
  
  tags = local.common_tags
}

# Application deployment
module "application" {
  source = "./modules/application"
  
  environment    = local.environment
  cloud_provider = local.cloud_provider
  
  # Cluster configuration
  cluster_name = (
    local.cloud_provider == "aws" ? try(module.aws_infrastructure[0].cluster_name, "") :
    local.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].cluster_name, "") :
    local.cloud_provider == "azure" ? try(module.azure_infrastructure[0].cluster_name, "") :
    ""
  )
  
  # Database endpoints
  database_endpoints = {
    postgres = (
      local.cloud_provider == "aws" ? try(module.aws_infrastructure[0].database_endpoints.postgres, "") :
      local.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].database_endpoints.postgres, "") :
      local.cloud_provider == "azure" ? try(module.azure_infrastructure[0].database_endpoints.postgres, "") :
      ""
    )
    mongodb = (
      local.cloud_provider == "aws" ? try(module.aws_infrastructure[0].database_endpoints.mongodb, "") :
      local.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].database_endpoints.mongodb, "") :
      local.cloud_provider == "azure" ? try(module.azure_infrastructure[0].database_endpoints.mongodb, "") :
      ""
    )
    redis = (
      local.cloud_provider == "aws" ? try(module.aws_infrastructure[0].database_endpoints.redis, "") :
      local.cloud_provider == "gcp" ? try(module.gcp_infrastructure[0].database_endpoints.redis, "") :
      local.cloud_provider == "azure" ? try(module.azure_infrastructure[0].database_endpoints.redis, "") :
      ""
    )
  }
  
  # Application configuration
  app_version = var.app_version
  app_domain  = var.app_domain
  
  # Resource allocation
  resource_limits = var.resource_limits
  
  tags = local.common_tags
}

# Load balancer and ingress
module "ingress" {
  source = "./modules/ingress"
  
  environment    = local.environment
  cloud_provider = local.cloud_provider
  
  # Domain configuration
  domain_name = var.app_domain
  ssl_cert_arn = var.ssl_cert_arn
  
  # Load balancer configuration
  enable_waf = var.enable_waf
  health_check_path = "/health"
  
  # Rate limiting
  rate_limit_requests_per_minute = var.rate_limit_requests_per_minute
  
  tags = local.common_tags
}