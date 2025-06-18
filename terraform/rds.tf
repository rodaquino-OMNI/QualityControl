# RDS Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = module.vpc.intra_subnets
  
  tags = merge(local.tags, {
    Name = "${local.name}-db-subnet-group"
  })
}

# RDS Parameter Group
resource "aws_db_parameter_group" "postgresql" {
  family = "postgres15"
  name   = "${local.name}-postgresql"
  
  parameter {
    name  = "log_statement"
    value = "all"
  }
  
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
  
  tags = local.tags
}

# Generate random password for database
resource "random_password" "database_password" {
  length  = 32
  special = true
}

# Store database password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "database_password" {
  name                    = "${local.name}-database-password"
  description             = "Database password for AUSTA Cockpit"
  recovery_window_in_days = 0
  
  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "database_password" {
  secret_id = aws_secretsmanager_secret.database_password.id
  secret_string = jsonencode({
    username = "austa"
    password = random_password.database_password.result
  })
}

# RDS Instance
resource "aws_db_instance" "postgresql" {
  identifier = local.name
  
  # Engine
  engine         = "postgres"
  engine_version = "15.4"
  
  # Instance
  instance_class        = var.database_instance_class
  allocated_storage     = var.database_allocated_storage
  max_allocated_storage = var.database_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  
  # Database
  db_name  = "austa_db"
  username = "austa"
  password = random_password.database_password.result
  
  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  
  # Backup
  backup_retention_period = var.backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  copy_tags_to_snapshot  = true
  skip_final_snapshot    = var.environment == "staging"
  final_snapshot_identifier = var.environment == "production" ? "${local.name}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  
  # High Availability
  multi_az = var.enable_multi_az
  
  # Performance
  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn        = aws_iam_role.rds_monitoring.arn
  
  # Parameter group
  parameter_group_name = aws_db_parameter_group.postgresql.name
  
  # Deletion protection
  deletion_protection = var.environment == "production"
  
  tags = merge(local.tags, {
    Name = "${local.name}-postgresql"
  })
}

# RDS Monitoring Role
resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name}-rds-monitoring"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
  
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Read replica for production
resource "aws_db_instance" "postgresql_read_replica" {
  count = var.environment == "production" ? 1 : 0
  
  identifier = "${local.name}-read-replica"
  
  # Source
  replicate_source_db = aws_db_instance.postgresql.identifier
  
  # Instance
  instance_class = var.database_instance_class
  
  # Network
  publicly_accessible = false
  
  # Performance
  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn        = aws_iam_role.rds_monitoring.arn
  
  tags = merge(local.tags, {
    Name = "${local.name}-postgresql-read-replica"
  })
}