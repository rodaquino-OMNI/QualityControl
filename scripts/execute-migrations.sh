#!/bin/bash

# Migration Execution Script for AUSTA Cockpit
# Created: 2025-06-22
# This script executes database migrations with proper error handling and rollback capabilities

set -e

# Configuration
DB_CONTAINER="austa-postgres-debug"
DB_NAME="austa_db"
DB_USER="austa"
MIGRATION_DIR="$(dirname "$0")/../db/migrations"
SEED_DIR="$(dirname "$0")/../db/seeds"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker container is running
check_container() {
    if ! docker ps | grep -q "$DB_CONTAINER"; then
        log_warn "Database container not running. Starting containers..."
        docker-compose -f "$(dirname "$0")/../docker-compose.debug.yml" up -d postgres redis
        sleep 15
    fi
    log_info "Database container is running"
}

# Test database connection
test_connection() {
    log_info "Testing database connection..."
    if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
        log_info "Database connection successful"
        return 0
    else
        log_error "Database connection failed"
        return 1
    fi
}

# Get current migrations
get_applied_migrations() {
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT version FROM public.schema_migrations ORDER BY applied_at;
    " 2>/dev/null | sed 's/^[ \t]*//;s/[ \t]*$//' | grep -v '^$' || echo ""
}

# Execute migration file
execute_migration() {
    local migration_file="$1"
    local migration_name=$(basename "$migration_file" .sql)
    
    log_info "Executing migration: $migration_name"
    
    # Copy migration file to container
    docker cp "$migration_file" "$DB_CONTAINER:/tmp/"
    
    # Execute migration
    if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -f "/tmp/$(basename "$migration_file")" > "/tmp/${migration_name}.log" 2>&1; then
        log_info "Migration $migration_name completed successfully"
        
        # Record migration in tracking table
        docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
            INSERT INTO public.schema_migrations (version) VALUES ('$migration_name')
            ON CONFLICT (version) DO NOTHING;
        " > /dev/null 2>&1
        
        return 0
    else
        log_error "Migration $migration_name failed"
        cat "/tmp/${migration_name}.log"
        return 1
    fi
}

# Execute seed file
execute_seed() {
    local seed_file="$1"
    local seed_name=$(basename "$seed_file" .sql)
    
    log_info "Executing seed: $seed_name"
    
    # Copy seed file to container
    docker cp "$seed_file" "$DB_CONTAINER:/tmp/"
    
    # Execute seed
    if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -f "/tmp/$(basename "$seed_file")" > "/tmp/${seed_name}.log" 2>&1; then
        log_info "Seed $seed_name completed successfully"
        return 0
    else
        log_error "Seed $seed_name failed"
        cat "/tmp/${seed_name}.log"
        return 1
    fi
}

# Rollback migration
rollback_migration() {
    local migration_version="$1"
    local rollback_file="$MIGRATION_DIR/rollback_${migration_version}.sql"
    
    if [ -f "$rollback_file" ]; then
        log_warn "Rolling back migration: $migration_version"
        docker cp "$rollback_file" "$DB_CONTAINER:/tmp/"
        
        if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -f "/tmp/$(basename "$rollback_file")"; then
            log_info "Rollback completed successfully"
            return 0
        else
            log_error "Rollback failed"
            return 1
        fi
    else
        log_error "Rollback file not found: $rollback_file"
        return 1
    fi
}

# Main execution function
main() {
    log_info "Starting migration execution..."
    
    # Check prerequisites
    check_container
    if ! test_connection; then
        log_error "Cannot connect to database. Exiting."
        exit 1
    fi
    
    # Get applied migrations
    applied_migrations=$(get_applied_migrations)
    log_info "Applied migrations: $applied_migrations"
    
    # Execute pending migrations
    migration_count=0
    for migration_file in "$MIGRATION_DIR"/*.sql; do
        if [ -f "$migration_file" ] && [[ ! "$migration_file" =~ rollback_ ]]; then
            migration_name=$(basename "$migration_file" .sql)
            
            if [[ "$applied_migrations" =~ $migration_name ]]; then
                log_info "Migration $migration_name already applied, skipping"
            else
                if execute_migration "$migration_file"; then
                    ((migration_count++))
                else
                    log_error "Migration failed. Consider rollback if needed."
                    exit 1
                fi
            fi
        fi
    done
    
    # Execute seed files if migrations were applied
    if [ $migration_count -gt 0 ]; then
        log_info "Executing seed files..."
        for seed_file in "$SEED_DIR"/*.sql; do
            if [ -f "$seed_file" ]; then
                execute_seed "$seed_file" || log_warn "Seed file failed but continuing..."
            fi
        done
    fi
    
    # Generate Prisma client
    log_info "Generating Prisma client..."
    cd "$(dirname "$0")/../backend"
    DATABASE_URL="postgresql://austa:austa123@localhost:5433/austa_db" npx prisma generate > /dev/null 2>&1 || log_warn "Prisma generate failed"
    
    log_info "Migration execution completed successfully!"
    log_info "Applied $migration_count new migrations"
}

# Handle script arguments
case "${1:-}" in
    rollback)
        if [ -z "$2" ]; then
            log_error "Usage: $0 rollback <migration_version>"
            exit 1
        fi
        rollback_migration "$2"
        ;;
    *)
        main
        ;;
esac