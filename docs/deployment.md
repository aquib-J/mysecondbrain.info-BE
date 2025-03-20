# Deployment Guide for MySecondBrain.info Backend

This guide provides detailed instructions for deploying the MySecondBrain.info backend application in both development and production environments using Docker.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
  - [Setting up Environment Variables](#setting-up-environment-variables)
  - [Building and Running Development Containers](#building-and-running-development-containers)
  - [Testing the Development Environment](#testing-the-development-environment)
- [Production Deployment](#production-deployment)
  - [Production Environment Variables](#production-environment-variables)
  - [Manual Production Deployment](#manual-production-deployment)
  - [Automated Deployment via GitHub Actions](#automated-deployment-via-github-actions)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
  - [Viewing Logs](#viewing-logs)
  - [Container Management](#container-management)
  - [Backup and Restore](#backup-and-restore)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have the following installed:

- Docker Engine (v20.10.0+)
- Docker Compose (v2.0.0+)
- Git (2.25.0+)

For production deployment to DigitalOcean, you will also need:

- A DigitalOcean account
- A Droplet with at least 4GB RAM and 2 vCPUs
- Docker installed on the Droplet
- DockerHub account for storing container images

## Development Setup

### Setting up Environment Variables

1. Create an environment file by copying the example file:

```bash
cp .env.development.example .env.development
```

2. Edit the `.env.development` file with your actual configuration:

```bash
# Open the file with your preferred editor
nano .env.development
```

3. Update all the placeholder values with your actual credentials and settings, especially:
   - JWT_SECRET (generate a secure random string)
   - AWS credentials
   - OpenAI API key

### Building and Running Development Containers

1. Build and start all containers:

```bash
docker compose up -d
```

This command will:
- Build the Node.js API container
- Pull the Weaviate, MySQL, and Redis images
- Start all services in detached mode

2. Check if all containers are running:

```bash
docker compose ps
```

You should see all services (api, weaviate, mysql, redis) with status "Up".

### Testing the Development Environment

1. Check the API status:

```bash
curl http://localhost:3500/status
```

Expected response: `{"success":true,"message":"Application is running","data":{"status":true}}`

2. Test Weaviate connectivity:

```bash
curl http://localhost:8080/v1/meta
```

You should receive a JSON response with Weaviate metadata.

3. Test MySQL connectivity from the API container:

```bash
docker compose exec api node -e "const mysql = require('mysql2/promise'); async function test() { try { const conn = await mysql.createConnection('mysql://root@mysql:3306/RAG_system'); console.log('MySQL connection successful'); conn.end(); } catch (err) { console.error('MySQL connection failed:', err); } }; test();"
```

4. Test Redis connectivity from the API container:

```bash
docker compose exec api node -e "const redis = require('redis'); const client = redis.createClient('redis://redis:6379'); client.on('connect', () => console.log('Redis connection successful')); client.on('error', (err) => console.error('Redis connection failed:', err)); client.connect();"
```

## Production Deployment

### Production Environment Variables

1. Create a production environment file:

```bash
cp .env.production.example .env.production
```

2. Update the `.env.production` file with secure credentials for your production environment.

3. Create a `.env` file for Docker Compose variables:

```bash
# Create a file for Docker Compose environment variables
cat > .env << EOL
MYSQL_ROOT_PASSWORD=your_secure_root_password
MYSQL_USER=mysecondbrain_user
MYSQL_PASSWORD=your_secure_user_password
REDIS_PASSWORD=your_secure_redis_password
WEAVIATE_API_KEY=your_secure_weaviate_api_key
DOCKERHUB_USERNAME=your_dockerhub_username
EOL
```

### Manual Production Deployment

1. Build and push the Docker image to DockerHub:

```bash
# Login to DockerHub
docker login

# Build and tag the image
docker build -t your_dockerhub_username/mysecondbrain-api:latest .

# Push to DockerHub
docker push your_dockerhub_username/mysecondbrain-api:latest
```

2. Deploy to your server:

```bash
# Connect to your server
ssh user@your_server_ip

# Create a project directory
mkdir -p ~/mysecondbrain.info-BE
cd ~/mysecondbrain.info-BE

# Copy the Docker Compose and environment files
# (Replace with your method of secure file transfer)
scp docker-compose.production.yml user@your_server_ip:~/mysecondbrain.info-BE/docker-compose.yml
scp .env.production user@your_server_ip:~/mysecondbrain.info-BE/.env.production
scp .env user@your_server_ip:~/mysecondbrain.info-BE/.env

# Start the services
docker compose up -d
```

### Automated Deployment via GitHub Actions

The repository includes a GitHub Actions workflow for automated deployment to a DigitalOcean Droplet.

1. Set up the following secrets in your GitHub repository:
   - `DOCKERHUB_USERNAME`: Your DockerHub username
   - `DOCKERHUB_TOKEN`: A personal access token for DockerHub
   - `DO_HOST`: Your DigitalOcean Droplet IP address
   - `DO_USERNAME`: Your Droplet SSH username
   - `DO_SSH_KEY`: Your private SSH key for the Droplet

2. Set up your DigitalOcean Droplet:
   - Install Docker and Docker Compose
   - Create the application directory: `mkdir -p ~/mysecondbrain.info-BE`
   - Copy the production Docker Compose file as `docker-compose.yml`
   - Copy the `.env` and `.env.production` files

3. Trigger the deployment by pushing to the `main` branch or manually running the workflow.

## Monitoring and Maintenance

### Viewing Logs

1. View logs for all containers:

```bash
docker compose logs
```

2. View logs for a specific service:

```bash
docker compose logs api
```

3. Follow logs in real-time:

```bash
docker compose logs -f api
```

### Container Management

1. Check running containers:

```bash
docker compose ps
```

2. Restart a specific service:

```bash
docker compose restart api
```

3. Stop all services:

```bash
docker compose down
```

4. Stop services and remove volumes (caution: this deletes all data):

```bash
docker compose down -v
```

### Backup and Restore

1. Back up MySQL data:

```bash
docker compose exec mysql mysqldump -u root RAG_system > backup.sql
```

2. Restore MySQL data:

```bash
cat backup.sql | docker compose exec -T mysql mysql -u root RAG_system
```

3. Back up Weaviate data:
   - The Weaviate data is stored in a Docker volume. See the [Weaviate documentation](https://weaviate.io/developers/weaviate/installation/docker-compose#backup-and-restore) for details on backing up and restoring Weaviate data.

## Troubleshooting

### Container Fails to Start

1. Check container logs:

```bash
docker compose logs api
```

2. Check if all environment variables are properly set:

```bash
docker compose config
```

3. Verify network connectivity between containers:

```bash
docker compose exec api ping mysql
docker compose exec api ping redis
docker compose exec api ping weaviate
```

### Database Connection Issues

1. Verify MySQL is running:

```bash
docker compose ps mysql
```

2. Test MySQL connection from the API container:

```bash
docker compose exec api node -e "const mysql = require('mysql2/promise'); async function test() { try { const conn = await mysql.createConnection(process.env.DB_URI); console.log('MySQL connection successful'); conn.end(); } catch (err) { console.error('MySQL connection failed:', err); } }; test();"
```

### Weaviate Connection Issues

1. Check if Weaviate is running:

```bash
docker compose ps weaviate
```

2. Verify Weaviate is accessible:

```bash
curl http://localhost:8080/v1/meta
```

If you encounter issues not covered in this guide, please check the application logs and refer to the specific service documentation. 