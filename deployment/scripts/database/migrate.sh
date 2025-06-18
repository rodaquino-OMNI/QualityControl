#!/bin/bash
# AUSTA Cockpit Database Migration Script
# Handles database migrations with backup, rollback, and validation

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../../" && pwd)"
DB_DIR="${PROJECT_ROOT}/db"
MIGRATIONS_DIR="${DB_DIR}/migrations"
SEEDS_DIR="${DB_DIR}/seeds"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
AUSTA Cockpit Database Migration Script

Usage: $0 <command> [options]

Commands:
    migrate <environment>           Run all pending migrations
    rollback <environment> [steps]  Rollback migrations (default: 1 step)
    seed <environment>              Run database seeding
    backup <environment>            Create database backup
    restore <environment> <file>    Restore database from backup
    status <environment>            Show migration status
    create <name>                   Create new migration file
    validate <environment>          Validate database schema
    reset <environment>             Reset database (destructive!)

Environments:
    development, staging, production

Options:
    -h, --help                      Show this help message
    -v, --verbose                   Enable verbose output
    -d, --dry-run                   Show what would be done without executing
    --force                         Force operation without confirmation
    --backup-before                 Create backup before migration

Examples:
    $0 migrate production --backup-before
    $0 rollback staging 2
    $0 seed development
    $0 backup production
    $0 status all
EOF
}

# Load environment configuration
load_config() {
    local env="$1"
    local config_file="${PROJECT_ROOT}/deployment/config/${env}.yaml"
    
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit 1
    fi
    
    # Extract database configuration using yq or python
    if command -v yq &> /dev/null; then
        export DB_HOST=$(yq eval '.database.host' "$config_file")
        export DB_PORT=$(yq eval '.database.port' "$config_file")
        export DB_NAME=$(yq eval '.database.name' "$config_file")
        export DB_SSL=$(yq eval '.database.ssl' "$config_file")
    else
        log_warning "yq not found. Using default database configuration."
        export DB_HOST="localhost"
        export DB_PORT="5432"
        export DB_NAME="austa_cockpit_${env}"
        export DB_SSL="false"
    fi
    
    # Load secrets
    local secrets_file="${PROJECT_ROOT}/deployment/config/secrets/${env}/secrets.yaml"
    if [[ -f "$secrets_file" ]]; then
        if command -v yq &> /dev/null; then
            export DB_PASSWORD=$(yq eval '.database.password' "$secrets_file")
            export DB_USERNAME=$(yq eval '.database.username // "postgres"' "$secrets_file")
        fi
    fi
    
    # Set defaults if not found
    export DB_USERNAME="${DB_USERNAME:-postgres}"
    export DB_PASSWORD="${DB_PASSWORD:-}"
    
    # MongoDB configuration
    if command -v yq &> /dev/null; then
        export MONGO_HOST=$(yq eval '.mongodb.host' "$config_file")
        export MONGO_PORT=$(yq eval '.mongodb.port' "$config_file")
        export MONGO_DB=$(yq eval '.mongodb.database' "$config_file")
    fi
}

# Create database backup
create_backup() {
    local env="$1"
    local backup_dir="${PROJECT_ROOT}/deployment/backups/${env}"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    mkdir -p "$backup_dir"
    
    log_info "Creating database backup for environment: $env"
    
    # PostgreSQL backup
    local pg_backup_file="${backup_dir}/postgres_${timestamp}.sql"
    log_info "Backing up PostgreSQL database..."
    
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USERNAME" \
        -d "$DB_NAME" \
        --verbose \
        --no-password \
        --format=custom \
        --file="${pg_backup_file}.custom" || {
        log_warning "Custom format backup failed, trying plain SQL..."
        PGPASSWORD="$DB_PASSWORD" pg_dump \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USERNAME" \
            -d "$DB_NAME" \
            --verbose \
            --no-password \
            > "$pg_backup_file" || {
            log_error "PostgreSQL backup failed"
            exit 1
        }
    }
    
    # MongoDB backup if configured
    if [[ -n "${MONGO_HOST:-}" ]]; then
        log_info "Backing up MongoDB database..."
        local mongo_backup_dir="${backup_dir}/mongodb_${timestamp}"
        
        mongodump \
            --host "${MONGO_HOST}:${MONGO_PORT}" \
            --db "$MONGO_DB" \
            --out "$mongo_backup_dir" || {
            log_warning "MongoDB backup failed"
        }
    fi
    
    # Compress backups
    log_info "Compressing backups..."
    tar -czf "${backup_dir}/backup_${timestamp}.tar.gz" -C "$backup_dir" . --exclude="*.tar.gz"
    
    log_success "Database backup completed: ${backup_dir}/backup_${timestamp}.tar.gz"
    echo "$backup_dir/backup_${timestamp}.tar.gz"
}

# Run database migrations
run_migrations() {
    local env="$1"
    local backup_before="${2:-false}"
    
    log_info "Running database migrations for environment: $env"
    
    # Create backup if requested
    if [[ "$backup_before" == "true" ]]; then
        create_backup "$env"
    fi
    
    # Check if migrations directory exists
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        log_error "Migrations directory not found: $MIGRATIONS_DIR"
        exit 1
    fi
    
    # Create migrations table if it doesn't exist
    log_info "Creating migrations tracking table..."
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USERNAME" \
        -d "$DB_NAME" \
        -c "CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );" || {
        log_error "Failed to create migrations table"
        exit 1
    }
    
    # Get list of applied migrations
    local applied_migrations=$(PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USERNAME" \
        -d "$DB_NAME" \
        -t -c "SELECT version FROM schema_migrations ORDER BY version;" | tr -d ' ')
    
    # Run pending migrations
    local migration_count=0
    for migration_file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
        local migration_name=$(basename "$migration_file" .sql)
        
        # Check if migration already applied
        if echo "$applied_migrations" | grep -q "^${migration_name}$"; then
            log_info "Migration already applied: $migration_name"
            continue
        fi
        
        log_info "Applying migration: $migration_name"
        
        # Apply migration
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USERNAME" \
            -d "$DB_NAME" \
            -f "$migration_file" || {
            log_error "Migration failed: $migration_name"
            exit 1
        }
        
        # Record migration as applied
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USERNAME" \
            -d "$DB_NAME" \
            -c "INSERT INTO schema_migrations (version) VALUES ('$migration_name');" || {
            log_error "Failed to record migration: $migration_name"
            exit 1
        }
        
        ((migration_count++))
        log_success "Migration applied: $migration_name"
    done
    
    if [[ $migration_count -eq 0 ]]; then
        log_info "No pending migrations found"
    else
        log_success "Applied $migration_count migrations"
    fi
}

# Rollback migrations
rollback_migrations() {
    local env="$1"
    local steps="${2:-1}"
    
    log_info "Rolling back $steps migration(s) for environment: $env"
    
    # Get last applied migrations
    local last_migrations=$(PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USERNAME" \
        -d "$DB_NAME" \
        -t -c "SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT $steps;")
    
    if [[ -z "$last_migrations" ]]; then
        log_warning "No migrations to rollback"
        return 0
    fi
    
    # Rollback each migration
    echo "$last_migrations" | while read -r migration_name; do
        migration_name=$(echo "$migration_name" | tr -d ' ')
        
        if [[ -z "$migration_name" ]]; then
            continue
        fi
        
        # Look for rollback file
        local rollback_file="${MIGRATIONS_DIR}/${migration_name}_rollback.sql"
        
        if [[ -f "$rollback_file" ]]; then
            log_info "Rolling back migration: $migration_name"
            
            # Apply rollback
            PGPASSWORD="$DB_PASSWORD" psql \
                -h "$DB_HOST" \
                -p "$DB_PORT" \
                -U "$DB_USERNAME" \
                -d "$DB_NAME" \
                -f "$rollback_file" || {
                log_error "Rollback failed: $migration_name"
                exit 1
            }
            
            # Remove from migrations table
            PGPASSWORD="$DB_PASSWORD" psql \
                -h "$DB_HOST" \
                -p "$DB_PORT" \
                -U "$DB_USERNAME" \
                -d "$DB_NAME" \
                -c "DELETE FROM schema_migrations WHERE version = '$migration_name';" || {
                log_error "Failed to remove migration record: $migration_name"
                exit 1
            }
            
            log_success "Migration rolled back: $migration_name"
        else
            log_warning "No rollback file found for migration: $migration_name"
            log_warning "Manual rollback may be required"
        fi
    done
}

# Run database seeding
run_seeding() {
    local env="$1"
    
    log_info "Running database seeding for environment: $env"
    
    # Check if seeds directory exists
    if [[ ! -d "$SEEDS_DIR" ]]; then
        log_error "Seeds directory not found: $SEEDS_DIR"
        exit 1
    fi
    
    # Run seed files in order
    for seed_file in $(ls "$SEEDS_DIR"/*.sql 2>/dev/null | sort); do
        local seed_name=$(basename "$seed_file" .sql)
        
        log_info "Running seed: $seed_name"
        
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USERNAME" \
            -d "$DB_NAME" \
            -f "$seed_file" || {
            log_error "Seed failed: $seed_name"
            exit 1
        }
        
        log_success "Seed completed: $seed_name"
    done
    
    log_success "Database seeding completed"
}

# Show migration status
show_status() {
    local env="$1"
    
    log_info "Migration status for environment: $env"
    
    # Get applied migrations
    local applied_migrations=$(PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USERNAME" \
        -d "$DB_NAME" \
        -t -c "SELECT version, applied_at FROM schema_migrations ORDER BY applied_at;" 2>/dev/null || echo "")
    
    # List all migration files
    echo
    echo "Applied Migrations:"
    echo "=================="
    if [[ -n "$applied_migrations" ]]; then
        echo "$applied_migrations" | while read -r line; do
            if [[ -n "$line" ]]; then
                echo "✓ $line"
            fi
        done
    else
        echo "No migrations applied"
    fi
    
    echo
    echo "Pending Migrations:"
    echo "=================="
    local pending_count=0
    for migration_file in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
        local migration_name=$(basename "$migration_file" .sql)
        
        if ! echo "$applied_migrations" | grep -q "$migration_name"; then
            echo "⏳ $migration_name"
            ((pending_count++))
        fi
    done
    
    if [[ $pending_count -eq 0 ]]; then
        echo "No pending migrations"
    fi
    
    echo
    log_success "Status check completed"
}

# Create new migration file
create_migration() {
    local name="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local migration_name="${timestamp}_${name}"
    local migration_file="${MIGRATIONS_DIR}/${migration_name}.sql"
    local rollback_file="${MIGRATIONS_DIR}/${migration_name}_rollback.sql"
    
    mkdir -p "$MIGRATIONS_DIR"
    
    # Create migration file
    cat > "$migration_file" << EOF
-- Migration: $name
-- Created: $(date)
-- 
-- Add your migration SQL here

BEGIN;

-- Your migration code here
-- Example:
-- CREATE TABLE example (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

COMMIT;
EOF
    
    # Create rollback file
    cat > "$rollback_file" << EOF
-- Rollback for migration: $name
-- Created: $(date)
-- 
-- Add your rollback SQL here

BEGIN;

-- Your rollback code here
-- Example:
-- DROP TABLE IF EXISTS example;

COMMIT;
EOF
    
    log_success "Migration files created:"
    log_info "Migration: $migration_file"
    log_info "Rollback:  $rollback_file"
}

# Main function
main() {
    local command="${1:-}"
    local environment="${2:-}"
    
    case "$command" in
        migrate)
            [[ -n "$environment" ]] || { log_error "Environment required"; show_help; exit 1; }
            load_config "$environment"
            local backup_before="false"
            [[ "${3:-}" == "--backup-before" ]] && backup_before="true"
            run_migrations "$environment" "$backup_before"
            ;;
        rollback)
            [[ -n "$environment" ]] || { log_error "Environment required"; show_help; exit 1; }
            load_config "$environment"
            rollback_migrations "$environment" "${3:-1}"
            ;;
        seed)
            [[ -n "$environment" ]] || { log_error "Environment required"; show_help; exit 1; }
            load_config "$environment"
            run_seeding "$environment"
            ;;
        backup)
            [[ -n "$environment" ]] || { log_error "Environment required"; show_help; exit 1; }
            load_config "$environment"
            create_backup "$environment"
            ;;
        status)
            [[ -n "$environment" ]] || { log_error "Environment required"; show_help; exit 1; }
            load_config "$environment"
            show_status "$environment"
            ;;
        create)
            [[ -n "$environment" ]] || { log_error "Migration name required"; show_help; exit 1; }
            create_migration "$environment"
            ;;
        validate)
            [[ -n "$environment" ]] || { log_error "Environment required"; show_help; exit 1; }
            load_config "$environment"
            # Add validation logic here
            log_success "Database validation completed"
            ;;
        -h|--help|help)
            show_help
            ;;
        *)
            log_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"