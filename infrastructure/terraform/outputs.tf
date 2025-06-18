# AUSTA Cockpit Infrastructure Outputs

# Network Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnets" {
  description = "List of IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnets" {
  description = "List of IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "nat_gateways" {
  description = "List of IDs of the NAT Gateways"
  value       = aws_nat_gateway.main[*].id
}

# Security Group Outputs
output "web_security_group_id" {
  description = "ID of the web security group"
  value       = aws_security_group.web.id
}

output "application_security_group_id" {
  description = "ID of the application security group"
  value       = aws_security_group.application.id
}

output "database_security_group_id" {
  description = "ID of the database security group"
  value       = aws_security_group.database.id
}

# Load Balancer Outputs
output "load_balancer_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "load_balancer_arn" {
  description = "ARN of the load balancer"
  value       = aws_lb.main.arn
}

output "load_balancer_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.main.zone_id
}

output "frontend_target_group_arn" {
  description = "ARN of the frontend target group"
  value       = aws_lb_target_group.frontend.arn
}

output "backend_target_group_arn" {
  description = "ARN of the backend target group"
  value       = aws_lb_target_group.backend.arn
}

# Auto Scaling Outputs
output "autoscaling_group_name" {
  description = "Name of the Auto Scaling group"
  value       = aws_autoscaling_group.app.name
}

output "autoscaling_group_arn" {
  description = "ARN of the Auto Scaling group"
  value       = aws_autoscaling_group.app.arn
}

output "launch_template_id" {
  description = "ID of the launch template"
  value       = aws_launch_template.app.id
}

# Database Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = var.use_rds ? aws_db_instance.postgres[0].endpoint : null
  sensitive   = false
}

output "rds_port" {
  description = "RDS instance port"
  value       = var.use_rds ? aws_db_instance.postgres[0].port : null
}

output "rds_instance_id" {
  description = "RDS instance ID"
  value       = var.use_rds ? aws_db_instance.postgres[0].id : null
}

output "database_url" {
  description = "Database connection URL"
  value       = var.use_rds ? "postgresql://${var.postgres_username}:${var.postgres_password}@${aws_db_instance.postgres[0].endpoint}:${aws_db_instance.postgres[0].port}/${var.postgres_db_name}" : null
  sensitive   = true
}

# Cache Outputs
output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = var.use_elasticache ? aws_elasticache_cluster.redis[0].cache_nodes[0].address : null
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = var.use_elasticache ? aws_elasticache_cluster.redis[0].port : null
}

output "redis_url" {
  description = "Redis connection URL"
  value       = var.use_elasticache ? "redis://${aws_elasticache_cluster.redis[0].cache_nodes[0].address}:${aws_elasticache_cluster.redis[0].port}" : null
  sensitive   = false
}

# Storage Outputs
output "backup_bucket_name" {
  description = "Name of the backup S3 bucket"
  value       = aws_s3_bucket.backups.bucket
}

output "backup_bucket_arn" {
  description = "ARN of the backup S3 bucket"
  value       = aws_s3_bucket.backups.arn
}

output "backup_bucket_domain_name" {
  description = "Domain name of the backup S3 bucket"
  value       = aws_s3_bucket.backups.bucket_domain_name
}

output "backup_replica_bucket_name" {
  description = "Name of the backup replica S3 bucket"
  value       = var.enable_cross_region_backup ? aws_s3_bucket.backups_replica[0].bucket : null
}

# IAM Outputs
output "ec2_role_arn" {
  description = "ARN of the EC2 IAM role"
  value       = aws_iam_role.ec2_role.arn
}

output "ec2_instance_profile_name" {
  description = "Name of the EC2 instance profile"
  value       = aws_iam_instance_profile.ec2_profile.name
}

# Monitoring Outputs
output "cloudwatch_log_group_application" {
  description = "Name of the application CloudWatch log group"
  value       = aws_cloudwatch_log_group.application.name
}

output "cloudwatch_log_group_infrastructure" {
  description = "Name of the infrastructure CloudWatch log group"
  value       = aws_cloudwatch_log_group.infrastructure.name
}

output "sns_topic_alerts_arn" {
  description = "ARN of the alerts SNS topic"
  value       = aws_sns_topic.alerts.arn
}

# DNS Outputs
output "route53_zone_id" {
  description = "Route53 hosted zone ID"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].zone_id : null
}

output "route53_name_servers" {
  description = "Route53 hosted zone name servers"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].name_servers : null
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = var.domain_name != "" ? aws_acm_certificate.main[0].arn : null
}

# Application URLs
output "application_url" {
  description = "URL to access the application"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "api_url" {
  description = "URL to access the API"
  value       = var.domain_name != "" ? "https://${var.domain_name}/api" : "http://${aws_lb.main.dns_name}/api"
}

# Infrastructure Information
output "infrastructure_summary" {
  description = "Summary of the deployed infrastructure"
  value = {
    environment             = var.environment
    region                 = var.aws_region
    vpc_id                 = aws_vpc.main.id
    load_balancer_dns      = aws_lb.main.dns_name
    database_endpoint      = var.use_rds ? aws_db_instance.postgres[0].endpoint : "containerized"
    cache_endpoint         = var.use_elasticache ? aws_elasticache_cluster.redis[0].cache_nodes[0].address : "containerized"
    backup_bucket          = aws_s3_bucket.backups.bucket
    autoscaling_group      = aws_autoscaling_group.app.name
    min_instances          = var.min_instances
    max_instances          = var.max_instances
    instance_type          = var.instance_type
    availability_zones     = length(aws_subnet.public)
  }
}

# Deployment Information
output "deployment_info" {
  description = "Information needed for application deployment"
  value = {
    # Environment variables for docker-compose
    AWS_REGION           = var.aws_region
    S3_BUCKET           = aws_s3_bucket.backups.bucket
    DATABASE_URL        = var.use_rds ? "postgresql://${var.postgres_username}:${var.postgres_password}@${aws_db_instance.postgres[0].endpoint}:${aws_db_instance.postgres[0].port}/${var.postgres_db_name}" : ""
    REDIS_URL           = var.use_elasticache ? "redis://${aws_elasticache_cluster.redis[0].cache_nodes[0].address}:${aws_elasticache_cluster.redis[0].port}" : ""
    ENVIRONMENT         = var.environment
    LOG_GROUP_APP       = aws_cloudwatch_log_group.application.name
    LOG_GROUP_INFRA     = aws_cloudwatch_log_group.infrastructure.name
    SNS_TOPIC_ALERTS    = aws_sns_topic.alerts.arn
  }
  sensitive = true
}

# Disaster Recovery Information
output "disaster_recovery_info" {
  description = "Information for disaster recovery procedures"
  value = {
    primary_region          = var.aws_region
    replica_region          = var.replica_region
    backup_bucket          = aws_s3_bucket.backups.bucket
    backup_replica_bucket  = var.enable_cross_region_backup ? aws_s3_bucket.backups_replica[0].bucket : null
    rds_instance_id        = var.use_rds ? aws_db_instance.postgres[0].id : null
    elasticache_cluster_id = var.use_elasticache ? aws_elasticache_cluster.redis[0].cluster_id : null
    autoscaling_group      = aws_autoscaling_group.app.name
    launch_template_id     = aws_launch_template.app.id
    vpc_id                 = aws_vpc.main.id
    security_groups = {
      web         = aws_security_group.web.id
      application = aws_security_group.application.id
      database    = aws_security_group.database.id
    }
    target_groups = {
      frontend = aws_lb_target_group.frontend.arn
      backend  = aws_lb_target_group.backend.arn
    }
  }
}

# Cost Information
output "estimated_monthly_cost" {
  description = "Estimated monthly cost breakdown"
  value = {
    ec2_instances = "Estimated based on ${var.instance_type} x ${var.desired_instances} instances"
    rds_database  = var.use_rds ? "Estimated based on ${var.db_instance_class}" : "Containerized (included in EC2)"
    elasticache   = var.use_elasticache ? "Estimated based on ${var.redis_node_type}" : "Containerized (included in EC2)"
    load_balancer = "Application Load Balancer standard pricing"
    s3_storage    = "Based on backup storage usage"
    data_transfer = "Based on actual usage"
    note          = "These are estimates. Actual costs may vary based on usage patterns."
  }
}

# Connection Strings (for application configuration)
output "connection_strings" {
  description = "Connection strings for services"
  value = {
    postgres_host = var.use_rds ? aws_db_instance.postgres[0].address : "postgres"
    postgres_port = var.use_rds ? aws_db_instance.postgres[0].port : 5432
    postgres_db   = var.postgres_db_name
    redis_host    = var.use_elasticache ? aws_elasticache_cluster.redis[0].cache_nodes[0].address : "redis"
    redis_port    = var.use_elasticache ? aws_elasticache_cluster.redis[0].port : 6379
  }
  sensitive = false
}

# Security Information
output "security_configuration" {
  description = "Security configuration details"
  value = {
    encryption_enabled    = var.enable_encryption
    vpc_flow_logs_enabled = var.enable_vpc_flow_logs
    backup_encryption     = "AES256"
    database_encryption   = var.use_rds ? aws_db_instance.postgres[0].storage_encrypted : false
    ssl_certificate       = var.domain_name != "" ? aws_acm_certificate.main[0].arn : null
  }
}

# Backup Configuration
output "backup_configuration" {
  description = "Backup configuration details"
  value = {
    backup_bucket           = aws_s3_bucket.backups.bucket
    backup_retention_days   = var.backup_retention_days
    cross_region_enabled    = var.enable_cross_region_backup
    db_backup_retention     = var.use_rds ? var.db_backup_retention_period : null
    db_backup_window        = var.use_rds ? var.db_backup_window : null
    versioning_enabled      = true
    lifecycle_policy_enabled = true
  }
}