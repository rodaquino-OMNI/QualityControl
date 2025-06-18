# AUSTA Cockpit Docker Configuration

This directory contains all Docker-related configuration files for AUSTA Cockpit.

## Quick Start

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your actual values (especially API keys)

3. Start the development environment:
   ```bash
   docker-compose up -d
   ```

4. Access the services:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - AI Service: http://localhost:8000
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379
   - MongoDB: localhost:27017

## Services

### Core Services

- **Frontend**: React/Next.js application served by Nginx
- **Backend**: Node.js/Express API server
- **AI Service**: Python/FastAPI service for AI operations
- **PostgreSQL**: Primary relational database
- **Redis**: Cache and session storage
- **MongoDB**: Log aggregation and analytics

### Optional Services (use profiles)

- **pgAdmin**: PostgreSQL management UI (port 5050)
- **Redis Commander**: Redis management UI (port 8081)
- **Mailhog**: Email testing service (ports 1025/8025)

To start with optional services:
```bash
docker-compose --profile tools --profile dev-tools up -d
```

## Development

The development setup includes:
- Hot reloading for all services
- Volume mounts for code synchronization
- Debug logging enabled
- Development-specific environment variables

### Useful Commands

```bash
# View logs
docker-compose logs -f [service-name]

# Restart a service
docker-compose restart [service-name]

# Execute commands in a container
docker-compose exec backend npm run test
docker-compose exec ai-service python manage.py migrate

# Rebuild after dependency changes
docker-compose build [service-name]
docker-compose up -d [service-name]
```

## Production Deployment

1. Build production images:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
   ```

2. Push to registry:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml push
   ```

3. Deploy on production server:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Production Features

- Health checks for all services
- Automatic restart policies
- Resource limits and reservations
- SSL/TLS termination
- Load balancing with Nginx
- Automated backups
- Monitoring with Prometheus/Grafana

## Backup and Restore

### Automated Backups

The backup service runs automatically based on the schedule in `.env`:
- PostgreSQL databases
- MongoDB collections
- Docker volumes
- Uploads to S3 (if configured)

### Manual Backup

```bash
docker-compose exec backup /scripts/backup-all.sh
```

### Restore from Backup

1. PostgreSQL:
   ```bash
   gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U austa austa_db
   ```

2. MongoDB:
   ```bash
   tar -xzf mongodb_backup.tar.gz
   docker-compose exec -T mongodb mongorestore --drop dump/
   ```

## Monitoring

Start monitoring stack:
```bash
docker-compose --profile monitoring up -d
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002 (admin/GRAFANA_PASSWORD)

## Troubleshooting

### Service Won't Start
- Check logs: `docker-compose logs [service-name]`
- Verify port availability: `lsof -i :PORT`
- Check environment variables in `.env`

### Database Connection Issues
- Ensure services are healthy: `docker-compose ps`
- Check network connectivity: `docker-compose exec backend ping postgres`
- Verify credentials in `.env`

### Performance Issues
- Monitor resource usage: `docker stats`
- Check service logs for errors
- Increase resource limits in docker-compose files

### Clean Up

```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# Remove all images
docker-compose down --rmi all
```

## Security Notes

- Change all default passwords in `.env`
- Use strong JWT secrets and encryption keys
- Enable SSL/TLS in production
- Restrict database access to local network
- Regular security updates for base images
- Use specific image versions in production

## File Structure

```
docker/
├── nginx.conf              # Frontend Nginx config (dev)
├── nginx-prod.conf         # Frontend Nginx config (prod)
├── nginx-lb.conf           # Load balancer config
├── init-db.sql             # PostgreSQL initialization
├── init-mongo.js           # MongoDB initialization
├── backup-scripts/         # Backup automation scripts
│   ├── backup-postgres.sh
│   ├── backup-mongodb.sh
│   └── backup-all.sh
├── backup-entrypoint.sh    # Backup service entrypoint
└── README.md               # This file
```