# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = module.vpc.intra_subnets
  
  tags = local.tags
}

# ElastiCache Parameter Group
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7.x"
  name   = "${local.name}-redis"
  
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  
  tags = local.tags
}

# Generate random password for Redis
resource "random_password" "redis_password" {
  length  = 32
  special = false
}

# Store Redis password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "redis_password" {
  name                    = "${local.name}-redis-password"
  description             = "Redis password for AUSTA Cockpit"
  recovery_window_in_days = 0
  
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "redis_password" {
  secret_id = aws_secretsmanager_secret.redis_password.id
  secret_string = jsonencode({
    password = random_password.redis_password.result
  })
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id         = local.name
  description                  = "Redis cluster for AUSTA Cockpit"
  
  # Node configuration
  node_type                    = var.redis_node_type
  port                         = 6379
  parameter_group_name         = aws_elasticache_parameter_group.redis.name
  
  # Cluster configuration
  num_cache_clusters           = var.redis_num_cache_nodes
  
  # Network
  subnet_group_name            = aws_elasticache_subnet_group.main.name
  security_group_ids           = [aws_security_group.redis.id]
  
  # Security
  auth_token                   = random_password.redis_password.result
  transit_encryption_enabled   = true
  at_rest_encryption_enabled   = true
  
  # Backup
  snapshot_retention_limit     = var.environment == "production" ? 7 : 1
  snapshot_window             = "03:00-05:00"
  maintenance_window          = "sun:05:00-sun:07:00"
  
  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  tags = merge(local.tags, {
    Name = "${local.name}-redis"
  })
}

# CloudWatch Log Group for Redis
resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/redis/${local.name}/slow-log"
  retention_in_days = 14
  
  tags = local.tags
}

# Multi-AZ Redis cluster for production
resource "aws_elasticache_replication_group" "redis_multiaz" {
  count = var.environment == "production" ? 1 : 0
  
  replication_group_id         = "${local.name}-multiaz"
  description                  = "Multi-AZ Redis cluster for AUSTA Cockpit"
  
  # Node configuration
  node_type                    = var.redis_node_type
  port                         = 6379
  parameter_group_name         = aws_elasticache_parameter_group.redis.name
  
  # Cluster configuration
  num_cache_clusters           = 3
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  
  # Network
  subnet_group_name            = aws_elasticache_subnet_group.main.name
  security_group_ids           = [aws_security_group.redis.id]
  
  # Security
  auth_token                   = random_password.redis_password.result
  transit_encryption_enabled   = true
  at_rest_encryption_enabled   = true
  
  # Backup
  snapshot_retention_limit     = 7
  snapshot_window             = "03:00-05:00"
  maintenance_window          = "sun:05:00-sun:07:00"
  
  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  tags = merge(local.tags, {
    Name = "${local.name}-redis-multiaz"
  })
}