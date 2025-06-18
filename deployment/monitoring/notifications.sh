#!/bin/bash
# AUSTA Cockpit Deployment Notifications
# Sends notifications to various channels about deployment status

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Global variables
ENVIRONMENT=""
STATUS=""
MESSAGE=""
STRATEGY=""
VERSION=""
WEBHOOK_URL=""
EMAIL_RECIPIENTS=""
TEAMS_WEBHOOK=""
PAGERDUTY_KEY=""

# Logging functions
log_info() {
    echo -e "${BLUE}[NOTIFY]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
AUSTA Cockpit Deployment Notifications

Usage: $0 [options]

Options:
    --environment <env>             Target environment
    --status <status>               Deployment status (started|success|failed|warning)
    --message <message>             Custom message
    --strategy <strategy>           Deployment strategy used
    --version <version>             Version deployed
    --slack-webhook <url>           Slack webhook URL
    --teams-webhook <url>           Microsoft Teams webhook URL
    --email-recipients <emails>     Comma-separated email list
    --pagerduty-key <key>          PagerDuty integration key
    -h, --help                      Show this help message

Status Values:
    started                         Deployment has begun
    success                         Deployment completed successfully
    failed                          Deployment failed
    warning                         Deployment completed with warnings
    rollback                        Rollback initiated
    validation_failed               Post-deployment validation failed

Examples:
    $0 --environment production --status started --message "Starting canary deployment"
    $0 --environment staging --status success --version v1.2.3 --strategy blue-green
    $0 --environment production --status failed --message "Database migration failed"
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --status)
                STATUS="$2"
                shift 2
                ;;
            --message)
                MESSAGE="$2"
                shift 2
                ;;
            --strategy)
                STRATEGY="$2"
                shift 2
                ;;
            --version)
                VERSION="$2"
                shift 2
                ;;
            --slack-webhook)
                WEBHOOK_URL="$2"
                shift 2
                ;;
            --teams-webhook)
                TEAMS_WEBHOOK="$2"
                shift 2
                ;;
            --email-recipients)
                EMAIL_RECIPIENTS="$2"
                shift 2
                ;;
            --pagerduty-key)
                PAGERDUTY_KEY="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [[ -z "$ENVIRONMENT" ]]; then
        log_error "Environment is required"
        exit 1
    fi
    
    if [[ -z "$STATUS" ]]; then
        log_error "Status is required"
        exit 1
    fi
    
    if [[ ! "$STATUS" =~ ^(started|success|failed|warning|rollback|validation_failed)$ ]]; then
        log_error "Invalid status: $STATUS"
        exit 1
    fi
}

# Load configuration from environment config
load_config() {
    local config_file="${PROJECT_ROOT}/deployment/config/${ENVIRONMENT}.yaml"
    
    if [[ -f "$config_file" ]]; then
        # Extract notification configuration using yq or defaults
        if command -v yq &> /dev/null; then
            if [[ -z "$WEBHOOK_URL" ]]; then
                WEBHOOK_URL=$(yq eval '.monitoring.alerts.webhook_url // ""' "$config_file")
            fi
            
            if [[ -z "$EMAIL_RECIPIENTS" ]]; then
                EMAIL_RECIPIENTS=$(yq eval '.monitoring.alerts.email_recipients[] // ""' "$config_file" | tr '\n' ',')
            fi
            
            if [[ -z "$PAGERDUTY_KEY" ]]; then
                PAGERDUTY_KEY=$(yq eval '.monitoring.alerts.pagerduty_key // ""' "$config_file")
            fi
        fi
    fi
    
    # Load from environment variables if not set
    WEBHOOK_URL="${WEBHOOK_URL:-$SLACK_WEBHOOK_URL}"
    EMAIL_RECIPIENTS="${EMAIL_RECIPIENTS:-$NOTIFICATION_EMAIL_RECIPIENTS}"
    PAGERDUTY_KEY="${PAGERDUTY_KEY:-$PAGERDUTY_INTEGRATION_KEY}"
}

# Get status emoji and color
get_status_info() {
    case "$STATUS" in
        started)
            echo "🚀" "warning" "#FFA500"
            ;;
        success)
            echo "✅" "good" "#36a64f"
            ;;
        failed)
            echo "❌" "danger" "#ff0000"
            ;;
        warning)
            echo "⚠️" "warning" "#FFA500"
            ;;
        rollback)
            echo "🔄" "warning" "#ff6600"
            ;;
        validation_failed)
            echo "🚫" "danger" "#cc0000"
            ;;
        *)
            echo "ℹ️" "info" "#0066cc"
            ;;
    esac
}

# Generate deployment summary
generate_summary() {
    local timestamp=$(date -Iseconds)
    local summary=""
    
    summary="AUSTA Cockpit Deployment $STATUS"
    summary+="\n\n**Environment:** $ENVIRONMENT"
    
    if [[ -n "$VERSION" ]]; then
        summary+="\n**Version:** $VERSION"
    fi
    
    if [[ -n "$STRATEGY" ]]; then
        summary+="\n**Strategy:** $STRATEGY"
    fi
    
    if [[ -n "$MESSAGE" ]]; then
        summary+="\n**Message:** $MESSAGE"
    fi
    
    summary+="\n**Timestamp:** $timestamp"
    
    case "$STATUS" in
        started)
            summary+="\n\n🔄 Deployment is now in progress..."
            ;;
        success)
            summary+="\n\n🎉 Deployment completed successfully!"
            ;;
        failed)
            summary+="\n\n💥 Deployment failed! Please check logs and initiate rollback if necessary."
            ;;
        warning)
            summary+="\n\n⚠️ Deployment completed with warnings. Please review logs."
            ;;
        rollback)
            summary+="\n\n🔄 Rollback has been initiated."
            ;;
        validation_failed)
            summary+="\n\n🚫 Post-deployment validation failed. Consider rollback."
            ;;
    esac
    
    echo -e "$summary"
}

# Send Slack notification
send_slack_notification() {
    if [[ -z "$WEBHOOK_URL" ]]; then
        log_info "No Slack webhook URL configured, skipping Slack notification"
        return 0
    fi
    
    log_info "Sending Slack notification..."
    
    local emoji color _
    read -r emoji _ color <<< "$(get_status_info)"
    
    local payload=$(cat <<EOF
{
    "username": "AUSTA Cockpit Deployer",
    "icon_emoji": ":rocket:",
    "attachments": [
        {
            "color": "$color",
            "title": "$emoji AUSTA Cockpit Deployment - $STATUS",
            "fields": [
                {
                    "title": "Environment",
                    "value": "$ENVIRONMENT",
                    "short": true
                },
                {
                    "title": "Version",
                    "value": "${VERSION:-latest}",
                    "short": true
                },
                {
                    "title": "Strategy",
                    "value": "${STRATEGY:-rolling}",
                    "short": true
                },
                {
                    "title": "Timestamp",
                    "value": "$(date -Iseconds)",
                    "short": true
                }
            ],
            "text": "${MESSAGE:-Deployment status update}",
            "footer": "AUSTA Cockpit DevOps",
            "ts": $(date +%s)
        }
    ]
}
EOF
)
    
    local response
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$WEBHOOK_URL" \
        -o /tmp/slack_response.txt)
    
    if [[ "$response" == "200" ]]; then
        log_success "Slack notification sent successfully"
    else
        log_error "Failed to send Slack notification (HTTP $response)"
        if [[ -f "/tmp/slack_response.txt" ]]; then
            log_error "Response: $(cat /tmp/slack_response.txt)"
        fi
    fi
}

# Send Microsoft Teams notification
send_teams_notification() {
    if [[ -z "$TEAMS_WEBHOOK" ]]; then
        log_info "No Teams webhook URL configured, skipping Teams notification"
        return 0
    fi
    
    log_info "Sending Microsoft Teams notification..."
    
    local emoji color _
    read -r emoji _ color <<< "$(get_status_info)"
    
    local payload=$(cat <<EOF
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "$color",
    "title": "$emoji AUSTA Cockpit Deployment",
    "text": "Deployment $STATUS for environment: **$ENVIRONMENT**",
    "sections": [
        {
            "facts": [
                {
                    "name": "Environment",
                    "value": "$ENVIRONMENT"
                },
                {
                    "name": "Version",
                    "value": "${VERSION:-latest}"
                },
                {
                    "name": "Strategy",
                    "value": "${STRATEGY:-rolling}"
                },
                {
                    "name": "Message",
                    "value": "${MESSAGE:-Deployment status update}"
                },
                {
                    "name": "Timestamp",
                    "value": "$(date -Iseconds)"
                }
            ]
        }
    ]
}
EOF
)
    
    local response
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$TEAMS_WEBHOOK" \
        -o /tmp/teams_response.txt)
    
    if [[ "$response" == "200" ]]; then
        log_success "Teams notification sent successfully"
    else
        log_error "Failed to send Teams notification (HTTP $response)"
    fi
}

# Send email notification
send_email_notification() {
    if [[ -z "$EMAIL_RECIPIENTS" ]]; then
        log_info "No email recipients configured, skipping email notification"
        return 0
    fi
    
    log_info "Sending email notification..."
    
    local subject="AUSTA Cockpit Deployment $STATUS - $ENVIRONMENT"
    local body=$(generate_summary)
    
    # Convert recipients to array
    IFS=',' read -ra recipients <<< "$EMAIL_RECIPIENTS"
    
    for recipient in "${recipients[@]}"; do
        recipient=$(echo "$recipient" | xargs)  # Trim whitespace
        
        if command -v mail &> /dev/null; then
            echo -e "$body" | mail -s "$subject" "$recipient"
            log_success "Email sent to $recipient"
        elif command -v sendmail &> /dev/null; then
            {
                echo "To: $recipient"
                echo "Subject: $subject"
                echo "Content-Type: text/plain"
                echo ""
                echo -e "$body"
            } | sendmail "$recipient"
            log_success "Email sent to $recipient via sendmail"
        else
            log_warning "No mail command available, cannot send email to $recipient"
        fi
    done
}

# Send PagerDuty alert
send_pagerduty_alert() {
    if [[ -z "$PAGERDUTY_KEY" ]]; then
        log_info "No PagerDuty key configured, skipping PagerDuty alert"
        return 0
    fi
    
    # Only send PagerDuty alerts for critical events
    if [[ "$STATUS" != "failed" && "$STATUS" != "validation_failed" ]]; then
        log_info "Status '$STATUS' doesn't require PagerDuty alert"
        return 0
    fi
    
    log_info "Sending PagerDuty alert..."
    
    local event_action="trigger"
    local severity="critical"
    local summary="AUSTA Cockpit Deployment $STATUS in $ENVIRONMENT"
    local source="austa-cockpit-deployer"
    local dedup_key="austa-cockpit-deployment-$ENVIRONMENT-$(date +%Y%m%d)"
    
    local payload=$(cat <<EOF
{
    "routing_key": "$PAGERDUTY_KEY",
    "event_action": "$event_action",
    "dedup_key": "$dedup_key",
    "payload": {
        "summary": "$summary",
        "source": "$source",
        "severity": "$severity",
        "component": "deployment",
        "group": "austa-cockpit",
        "class": "deployment-failure",
        "custom_details": {
            "environment": "$ENVIRONMENT",
            "version": "${VERSION:-latest}",
            "strategy": "${STRATEGY:-rolling}",
            "message": "${MESSAGE:-Deployment failed}",
            "timestamp": "$(date -Iseconds)"
        }
    }
}
EOF
)
    
    local response
    response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "https://events.pagerduty.com/v2/enqueue" \
        -o /tmp/pagerduty_response.txt)
    
    if [[ "$response" == "202" ]]; then
        log_success "PagerDuty alert sent successfully"
    else
        log_error "Failed to send PagerDuty alert (HTTP $response)"
    fi
}

# Log notification to file
log_notification() {
    local log_dir="${PROJECT_ROOT}/deployment/logs"
    local log_file="${log_dir}/notifications.log"
    
    mkdir -p "$log_dir"
    
    local log_entry=$(cat <<EOF
$(date -Iseconds) | $ENVIRONMENT | $STATUS | ${VERSION:-latest} | ${STRATEGY:-rolling} | ${MESSAGE:-N/A}
EOF
)
    
    echo "$log_entry" >> "$log_file"
    log_info "Notification logged to $log_file"
}

# Update deployment status file
update_status_file() {
    local status_dir="${PROJECT_ROOT}/deployment/status"
    local status_file="${status_dir}/${ENVIRONMENT}-status.json"
    
    mkdir -p "$status_dir"
    
    local status_json=$(cat <<EOF
{
    "environment": "$ENVIRONMENT",
    "status": "$STATUS",
    "version": "${VERSION:-latest}",
    "strategy": "${STRATEGY:-rolling}",
    "message": "${MESSAGE:-N/A}",
    "timestamp": "$(date -Iseconds)",
    "last_updated": "$(date -Iseconds)"
}
EOF
)
    
    echo "$status_json" > "$status_file"
    log_info "Status file updated: $status_file"
}

# Send all notifications
send_all_notifications() {
    log_info "Sending notifications for deployment $STATUS in $ENVIRONMENT"
    
    # Send notifications in parallel for better performance
    {
        send_slack_notification &
        send_teams_notification &
        send_email_notification &
        send_pagerduty_alert &
        wait
    }
    
    # Log and update status files
    log_notification
    update_status_file
    
    log_success "All notifications processed"
}

# Main function
main() {
    load_config
    send_all_notifications
}

# Parse arguments and run
parse_args "$@"
validate_args
main