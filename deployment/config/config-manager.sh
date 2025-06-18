#!/bin/bash
# AUSTA Cockpit Configuration Manager
# Manages environment-specific configurations and secrets

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${SCRIPT_DIR}"
SECRETS_DIR="${CONFIG_DIR}/secrets"
VAULT_ADDR="${VAULT_ADDR:-}"
VAULT_TOKEN="${VAULT_TOKEN:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
AUSTA Cockpit Configuration Manager

Usage: $0 <command> [options]

Commands:
    init <environment>              Initialize configuration for environment
    validate <environment>         Validate configuration files
    encrypt <file>                  Encrypt sensitive configuration file
    decrypt <file>                  Decrypt configuration file
    sync <environment>              Sync configuration with remote store
    diff <env1> <env2>              Compare configurations between environments
    template <environment>          Generate configuration template
    secrets <command>               Manage secrets (get, set, list, delete)
    backup <environment>            Backup configuration
    restore <environment> <backup>  Restore configuration from backup

Options:
    -h, --help                      Show this help message
    -v, --verbose                   Enable verbose output
    -d, --dry-run                   Show what would be done without executing

Examples:
    $0 init production
    $0 validate staging
    $0 secrets set production DB_PASSWORD
    $0 sync production
    $0 diff staging production
EOF
}

# Initialize configuration for environment
init_config() {
    local env="$1"
    
    if [[ ! "$env" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $env. Must be one of: development, staging, production"
        exit 1
    fi
    
    log_info "Initializing configuration for environment: $env"
    
    # Create secrets directory if it doesn't exist
    mkdir -p "${SECRETS_DIR}/${env}"
    
    # Create environment-specific secrets template
    cat > "${SECRETS_DIR}/${env}/secrets.yaml" << EOF
# Secrets for ${env} environment
# This file should be encrypted before storing in version control

database:
  password: ""
  ssl_cert: ""
  ssl_key: ""

redis:
  password: ""
  auth_token: ""

mongodb:
  username: ""
  password: ""
  ssl_cert: ""

ai_service:
  api_keys:
    openai: ""
    anthropic: ""
    google: ""
  model_licenses: {}

security:
  jwt_secret: ""
  encryption_key: ""
  ssl_certificates:
    cert: ""
    key: ""
    ca: ""

external_services:
  slack_webhook: ""
  pagerduty_key: ""
  smtp_password: ""
  
cloud_providers:
  aws:
    access_key_id: ""
    secret_access_key: ""
    session_token: ""
  gcp:
    service_account_key: ""
    project_id: ""
  azure:
    client_id: ""
    client_secret: ""
    tenant_id: ""
    subscription_id: ""

monitoring:
  grafana_admin_password: ""
  prometheus_auth_token: ""
  alertmanager_webhook: ""
EOF
    
    # Set appropriate permissions
    chmod 600 "${SECRETS_DIR}/${env}/secrets.yaml"
    
    log_success "Configuration initialized for $env environment"
    log_info "Please edit ${SECRETS_DIR}/${env}/secrets.yaml with your secrets"
    log_warning "Remember to encrypt this file before committing to version control"
}

# Validate configuration
validate_config() {
    local env="$1"
    local config_file="${CONFIG_DIR}/${env}.yaml"
    local secrets_file="${SECRETS_DIR}/${env}/secrets.yaml"
    
    log_info "Validating configuration for environment: $env"
    
    # Check if configuration file exists
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit 1
    fi
    
    # Validate YAML syntax
    if command -v yq &> /dev/null; then
        if ! yq eval '.' "$config_file" > /dev/null 2>&1; then
            log_error "Invalid YAML syntax in $config_file"
            exit 1
        fi
    elif command -v python3 &> /dev/null; then
        if ! python3 -c "import yaml; yaml.safe_load(open('$config_file'))" 2>/dev/null; then
            log_error "Invalid YAML syntax in $config_file"
            exit 1
        fi
    else
        log_warning "No YAML validator found. Skipping syntax validation."
    fi
    
    # Check required fields
    local required_fields=(
        "environment"
        "app.name"
        "app.domain"
        "database.host"
        "deployment.strategy"
    )
    
    for field in "${required_fields[@]}"; do
        if command -v yq &> /dev/null; then
            if [[ "$(yq eval ".${field}" "$config_file")" == "null" ]]; then
                log_error "Required field missing: $field"
                exit 1
            fi
        fi
    done
    
    # Validate secrets file if it exists
    if [[ -f "$secrets_file" ]]; then
        if command -v yq &> /dev/null; then
            if ! yq eval '.' "$secrets_file" > /dev/null 2>&1; then
                log_error "Invalid YAML syntax in $secrets_file"
                exit 1
            fi
        fi
    fi
    
    log_success "Configuration validation passed for $env"
}

# Encrypt configuration file
encrypt_config() {
    local file="$1"
    
    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        exit 1
    fi
    
    log_info "Encrypting configuration file: $file"
    
    # Use gpg for encryption
    if command -v gpg &> /dev/null; then
        gpg --symmetric --cipher-algo AES256 --compress-algo 1 --s2k-digest-algo SHA512 \
            --output "${file}.gpg" "$file"
        
        if [[ $? -eq 0 ]]; then
            log_success "File encrypted: ${file}.gpg"
            log_warning "Consider removing the original file: $file"
        else
            log_error "Encryption failed"
            exit 1
        fi
    else
        log_error "GPG not found. Please install GPG for encryption."
        exit 1
    fi
}

# Decrypt configuration file
decrypt_config() {
    local file="$1"
    
    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        exit 1
    fi
    
    log_info "Decrypting configuration file: $file"
    
    # Use gpg for decryption
    if command -v gpg &> /dev/null; then
        local output_file="${file%.gpg}"
        gpg --quiet --batch --yes --decrypt --output "$output_file" "$file"
        
        if [[ $? -eq 0 ]]; then
            log_success "File decrypted: $output_file"
            chmod 600 "$output_file"
        else
            log_error "Decryption failed"
            exit 1
        fi
    else
        log_error "GPG not found. Please install GPG for decryption."
        exit 1
    fi
}

# Sync configuration with remote store
sync_config() {
    local env="$1"
    
    log_info "Syncing configuration for environment: $env"
    
    # Check if HashiCorp Vault is configured
    if [[ -n "$VAULT_ADDR" && -n "$VAULT_TOKEN" ]]; then
        log_info "Syncing with HashiCorp Vault..."
        
        # Read secrets from local file
        local secrets_file="${SECRETS_DIR}/${env}/secrets.yaml"
        if [[ -f "$secrets_file" ]]; then
            # Upload secrets to Vault
            vault kv put "secret/austa-cockpit/${env}" @"$secrets_file"
            log_success "Secrets synced to Vault"
        fi
    else
        log_warning "Vault not configured. Skipping remote sync."
    fi
    
    # Additional sync methods can be added here (AWS Secrets Manager, etc.)
}

# Compare configurations between environments
diff_config() {
    local env1="$1"
    local env2="$2"
    
    log_info "Comparing configurations: $env1 vs $env2"
    
    local config1="${CONFIG_DIR}/${env1}.yaml"
    local config2="${CONFIG_DIR}/${env2}.yaml"
    
    if [[ ! -f "$config1" ]]; then
        log_error "Configuration file not found: $config1"
        exit 1
    fi
    
    if [[ ! -f "$config2" ]]; then
        log_error "Configuration file not found: $config2"
        exit 1
    fi
    
    # Use diff or a YAML-aware diff tool
    if command -v dyff &> /dev/null; then
        dyff between "$config1" "$config2"
    elif command -v diff &> /dev/null; then
        diff -u "$config1" "$config2" || true
    else
        log_error "No diff tool available"
        exit 1
    fi
}

# Generate configuration template
generate_template() {
    local env="$1"
    local template_file="${CONFIG_DIR}/${env}-template.yaml"
    
    log_info "Generating configuration template for environment: $env"
    
    # Copy from development template and modify
    cp "${CONFIG_DIR}/development.yaml" "$template_file"
    
    # Replace environment-specific values with placeholders
    sed -i.bak "s/environment: development/environment: $env/g" "$template_file"
    sed -i.bak 's/localhost/${HOST}/g' "$template_file"
    sed -i.bak 's/dev-secret-key/${JWT_SECRET}/g' "$template_file"
    
    rm "${template_file}.bak" 2>/dev/null || true
    
    log_success "Template generated: $template_file"
}

# Backup configuration
backup_config() {
    local env="$1"
    local backup_dir="${CONFIG_DIR}/backups"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="${backup_dir}/${env}_${timestamp}.tar.gz"
    
    log_info "Creating backup for environment: $env"
    
    mkdir -p "$backup_dir"
    
    # Create compressed backup
    tar -czf "$backup_file" \
        -C "$CONFIG_DIR" "${env}.yaml" \
        -C "$SECRETS_DIR" "${env}/" 2>/dev/null || true
    
    if [[ -f "$backup_file" ]]; then
        log_success "Backup created: $backup_file"
    else
        log_error "Backup creation failed"
        exit 1
    fi
}

# Restore configuration
restore_config() {
    local env="$1"
    local backup_file="$2"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    log_info "Restoring configuration for environment: $env from $backup_file"
    
    # Extract backup
    tar -xzf "$backup_file" -C /tmp/
    
    # Move files to correct locations
    if [[ -f "/tmp/${env}.yaml" ]]; then
        mv "/tmp/${env}.yaml" "${CONFIG_DIR}/"
        log_success "Configuration restored: ${CONFIG_DIR}/${env}.yaml"
    fi
    
    if [[ -d "/tmp/${env}" ]]; then
        rm -rf "${SECRETS_DIR}/${env}"
        mv "/tmp/${env}" "${SECRETS_DIR}/"
        log_success "Secrets restored: ${SECRETS_DIR}/${env}/"
    fi
}

# Main function
main() {
    case "${1:-}" in
        init)
            [[ -n "${2:-}" ]] || { log_error "Environment required"; exit 1; }
            init_config "$2"
            ;;
        validate)
            [[ -n "${2:-}" ]] || { log_error "Environment required"; exit 1; }
            validate_config "$2"
            ;;
        encrypt)
            [[ -n "${2:-}" ]] || { log_error "File path required"; exit 1; }
            encrypt_config "$2"
            ;;
        decrypt)
            [[ -n "${2:-}" ]] || { log_error "File path required"; exit 1; }
            decrypt_config "$2"
            ;;
        sync)
            [[ -n "${2:-}" ]] || { log_error "Environment required"; exit 1; }
            sync_config "$2"
            ;;
        diff)
            [[ -n "${2:-}" && -n "${3:-}" ]] || { log_error "Two environments required"; exit 1; }
            diff_config "$2" "$3"
            ;;
        template)
            [[ -n "${2:-}" ]] || { log_error "Environment required"; exit 1; }
            generate_template "$2"
            ;;
        backup)
            [[ -n "${2:-}" ]] || { log_error "Environment required"; exit 1; }
            backup_config "$2"
            ;;
        restore)
            [[ -n "${2:-}" && -n "${3:-}" ]] || { log_error "Environment and backup file required"; exit 1; }
            restore_config "$2" "$3"
            ;;
        -h|--help|help)
            show_help
            ;;
        *)
            log_error "Unknown command: ${1:-}"
            show_help
            exit 1
            ;;
    esac
}

# Make secrets directory if it doesn't exist
mkdir -p "$SECRETS_DIR"

# Run main function
main "$@"