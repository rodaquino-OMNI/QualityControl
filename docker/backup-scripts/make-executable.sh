#!/bin/bash

# Make all backup and DR scripts executable
echo "Making all backup and disaster recovery scripts executable..."

# Backup scripts
chmod +x /Users/rodrigo/claude-projects/QualityControl/QualityControl/docker/backup-scripts/*.sh

# Disaster recovery scripts
chmod +x /Users/rodrigo/claude-projects/QualityControl/QualityControl/docker/disaster-recovery/*.sh

echo "All scripts are now executable"
echo ""
echo "Available backup and disaster recovery scripts:"
echo "=============================================="
echo ""
echo "Backup Scripts:"
echo "  backup-all.sh                    - Master backup orchestrator"
echo "  backup-postgres.sh               - Standard PostgreSQL backup"
echo "  backup-postgres-pitr.sh          - PostgreSQL with Point-in-Time Recovery"
echo "  backup-redis.sh                  - Redis multi-strategy backup"
echo "  backup-mongodb.sh                - MongoDB multi-strategy backup"
echo "  backup-application-data.sh       - Application data export"
echo "  cross-region-replication.sh      - Cross-region backup replication"
echo ""
echo "Restore Scripts:"
echo "  restore-postgres-pitr.sh         - PostgreSQL PITR restore"
echo "  restore-redis.sh                 - Redis restore (RDB/AOF/memory)"
echo "  restore-mongodb.sh               - MongoDB restore (dump/export)"
echo ""
echo "Monitoring & Testing:"
echo "  backup-monitor.sh                - Backup monitoring and validation"
echo "  dr-test-automation.sh            - DR testing automation"
echo ""
echo "Disaster Recovery:"
echo "  dr-orchestrator.sh               - Master disaster recovery orchestrator"
echo ""
echo "Infrastructure:"
echo "  terraform/                       - Infrastructure as Code"
echo "  disaster-recovery-plan.md        - Comprehensive DR plan"
echo ""
echo "Usage Examples:"
echo "  ./backup-all.sh                  # Run full backup"
echo "  ./backup-monitor.sh monitor       # Monitor backup health"
echo "  ./dr-test-automation.sh backup    # Test backup procedures"
echo "  ./dr-orchestrator.sh full hardware-failure  # Full DR"