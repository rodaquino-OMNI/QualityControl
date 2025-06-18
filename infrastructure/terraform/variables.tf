# AUSTA Cockpit Infrastructure Variables

# General Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "austa-cockpit"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["development", "staging", "production", "dr"], var.environment)
    error_message = "Environment must be one of: development, staging, production, dr."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "replica_region" {
  description = "AWS region for cross-region replication"
  type        = string
  default     = "us-west-2"
}

variable "availability_zones" {
  description = "Number of availability zones to use"
  type        = number
  default     = 2
  validation {
    condition     = var.availability_zones >= 2 && var.availability_zones <= 3
    error_message = "Number of availability zones must be between 2 and 3."
  }
}

# Network Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "admin_cidr" {
  description = "CIDR block for admin access"
  type        = string
  default     = "0.0.0.0/0"
}

# Compute Configuration
variable "instance_type" {
  description = "EC2 instance type for application servers"
  type        = string
  default     = "t3.medium"
}

variable "key_pair_name" {
  description = "Name of the EC2 Key Pair for SSH access"
  type        = string
  default     = ""
}

variable "min_instances" {
  description = "Minimum number of instances in Auto Scaling Group"
  type        = number
  default     = 2
}

variable "max_instances" {
  description = "Maximum number of instances in Auto Scaling Group"
  type        = number
  default     = 10
}

variable "desired_instances" {
  description = "Desired number of instances in Auto Scaling Group"
  type        = number
  default     = 2
}

# Database Configuration
variable "use_rds" {
  description = "Use RDS for PostgreSQL instead of containerized"
  type        = bool
  default     = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Initial storage allocation for RDS instance (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum storage allocation for RDS instance (GB)"
  type        = number
  default     = 100
}

variable "postgres_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "15.4"
}

variable "postgres_db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "austa_db"
}

variable "postgres_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "austa"
}

variable "postgres_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_backup_retention_period" {
  description = "Database backup retention period in days"
  type        = number
  default     = 7
}

variable "db_backup_window" {
  description = "Database backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "db_maintenance_window" {
  description = "Database maintenance window"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

# Cache Configuration
variable "use_elasticache" {
  description = "Use ElastiCache for Redis instead of containerized"
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

# Storage Configuration
variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 30
}

variable "enable_cross_region_backup" {
  description = "Enable cross-region backup replication"
  type        = bool
  default     = true
}

# Logging Configuration
variable "log_retention_days" {
  description = "CloudWatch logs retention period in days"
  type        = number
  default     = 14
}

# Monitoring and Alerting
variable "alert_email" {
  description = "Email address for alerts"
  type        = string
  default     = ""
}

# Domain and SSL
variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = ""
}

# Application Configuration
variable "docker_host" {
  description = "Docker host for Docker provider"
  type        = string
  default     = "unix:///var/run/docker.sock"
}

variable "docker_compose_url" {
  description = "URL to download docker-compose configuration"
  type        = string
  default     = "https://raw.githubusercontent.com/austa/cockpit/main/docker-compose.prod.yml"
}

# Security Configuration
variable "enable_encryption" {
  description = "Enable encryption for storage and transit"
  type        = bool
  default     = true
}

variable "enable_vpc_flow_logs" {
  description = "Enable VPC Flow Logs"
  type        = bool
  default     = true
}

# Disaster Recovery Configuration
variable "dr_mode" {
  description = "Enable disaster recovery mode configuration"
  type        = bool
  default     = false
}

variable "cross_region_replication" {
  description = "Enable cross-region replication"
  type        = bool
  default     = true
}

variable "backup_schedule" {
  description = "Cron expression for backup schedule"
  type        = string
  default     = "0 2 * * *"  # Daily at 2 AM
}

# Cost Optimization
variable "enable_spot_instances" {
  description = "Use spot instances for cost optimization (non-production)"
  type        = bool
  default     = false
}

variable "spot_instance_types" {
  description = "List of instance types for spot instances"
  type        = list(string)
  default     = ["t3.medium", "t3.large", "m5.large"]
}

# Compliance and Governance
variable "compliance_mode" {
  description = "Enable compliance features (encryption, auditing, etc.)"
  type        = bool
  default     = true
}

variable "enable_config" {
  description = "Enable AWS Config for compliance monitoring"
  type        = bool
  default     = true
}

variable "enable_cloudtrail" {
  description = "Enable CloudTrail for audit logging"
  type        = bool
  default     = true
}

# Performance Configuration
variable "enable_performance_insights" {
  description = "Enable RDS Performance Insights"
  type        = bool
  default     = true
}

variable "performance_insights_retention_period" {
  description = "Performance Insights retention period in days"
  type        = number
  default     = 7
}

# Tagging
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# Feature Flags
variable "enable_waf" {
  description = "Enable AWS WAF for web application protection"
  type        = bool
  default     = true
}

variable "enable_shield" {
  description = "Enable AWS Shield Advanced for DDoS protection"
  type        = bool
  default     = false
}

variable "enable_secrets_manager" {
  description = "Use AWS Secrets Manager for sensitive configuration"
  type        = bool
  default     = true
}

variable "enable_parameter_store" {
  description = "Use AWS Systems Manager Parameter Store for configuration"
  type        = bool
  default     = true
}

# Backup Configuration
variable "backup_vault_name" {
  description = "AWS Backup vault name"
  type        = string
  default     = "austa-backup-vault"
}

variable "backup_plan_name" {
  description = "AWS Backup plan name"
  type        = string
  default     = "austa-backup-plan"
}

variable "backup_selection_name" {
  description = "AWS Backup selection name"
  type        = string
  default     = "austa-backup-selection"
}

# Multi-Environment Support
variable "environment_config" {
  description = "Environment-specific configuration overrides"
  type = map(object({
    instance_type    = string
    min_instances    = number
    max_instances    = number
    db_instance_class = string
    enable_monitoring = bool
  }))
  default = {
    development = {
      instance_type     = "t3.small"
      min_instances     = 1
      max_instances     = 2
      db_instance_class = "db.t3.micro"
      enable_monitoring = false
    }
    staging = {
      instance_type     = "t3.medium"
      min_instances     = 1
      max_instances     = 3
      db_instance_class = "db.t3.small"
      enable_monitoring = true
    }
    production = {
      instance_type     = "t3.large"
      min_instances     = 2
      max_instances     = 10
      db_instance_class = "db.t3.medium"
      enable_monitoring = true
    }
    dr = {
      instance_type     = "t3.medium"
      min_instances     = 1
      max_instances     = 5
      db_instance_class = "db.t3.small"
      enable_monitoring = true
    }
  }
}