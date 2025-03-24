#!/bin/bash
# server-setup.sh - Automated setup script for Ubuntu servers
# This script installs Node.js/NVM, Python, Git, Docker, and Docker Compose
# Date: 2025-03-20

set -e  # Exit immediately if a command exits with a non-zero status

# Print colored output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== MySecondBrain.info Server Setup Script ===${NC}"
echo -e "${YELLOW}This script will install the following:${NC}"
echo "- Node.js via NVM"
echo "- Python 3 and pip"
echo "- Git"
echo "- Docker and Docker Compose"
echo ""

# Update package lists
echo -e "${GREEN}Updating package lists...${NC}"
sudo apt-get update

# Install essential packages
echo -e "${GREEN}Installing essential packages...${NC}"
sudo apt-get install -y \
    curl \
    wget \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    build-essential

# Install Git
echo -e "${GREEN}Installing Git...${NC}"
sudo apt-get install -y git

# Install NVM and Node.js
echo -e "${GREEN}Installing NVM and Node.js...${NC}"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load NVM immediately
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install the latest LTS version of Node.js
nvm install lts/hydrogen
nvm use lts/hydrogen
nvm alias default lts/hydrogen

# Verify Node and npm installation
echo -e "${GREEN}Node.js version:${NC}"
node --version
echo -e "${GREEN}npm version:${NC}"
npm --version

# Install Python and pip
echo -e "${GREEN}Installing Python 3 and pip...${NC}"
sudo apt-get install -y python3 python3-pip python3-venv

# Verify Python installations
echo -e "${GREEN}Python version:${NC}"
python3 --version
echo -e "${GREEN}pip version:${NC}"
pip3 --version

# Install Docker
echo -e "${GREEN}Installing Docker...${NC}"
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Add current user to docker group to avoid using sudo
sudo usermod -aG docker $USER
echo -e "${YELLOW}NOTE: You'll need to log out and back in for docker group changes to take effect${NC}"

# Install Docker Compose
echo -e "${GREEN}Installing Docker Compose...${NC}"
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
sudo curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify Docker installations
echo -e "${GREEN}Docker version:${NC}"
docker --version
echo -e "${GREEN}Docker Compose version:${NC}"
docker-compose --version

# Create default directories
echo -e "${GREEN}Creating default directories...${NC}"
mkdir -p ~/logs ~/data

echo -e "${GREEN}=== Installation Complete! ===${NC}"
echo -e "${YELLOW}NOTE: Some changes require logging out and back in to take effect.${NC}"
echo "You may want to run: source ~/.bashrc"




echo "Next steps:"
echo "1. Create ssh key and save the updated ssh key in github settings -> under SSH and GPG keys"
echo "2. Install Github cli client and login to github using: gh auth login"
echo "3. Clone your repository: gh repo clone yourusername/mysecondbrain.info-BE and cd mysecondbrain.info-BE"
echo "4. Create .env.production file and add the required variables"
echo "5. Just run the nginx/init-letsencrypt.sh script to setup the SSL certificates"
echo "6. Run the docker-compose.production.yml file to start the containers"