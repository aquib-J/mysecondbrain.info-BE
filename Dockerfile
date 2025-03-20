FROM node:hydrogen

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Create necessary directories
RUN mkdir -p logs doc-store output-store

# Create empty logs directory
RUN mkdir -p logs && touch logs/.gitkeep

# Make sure Python scripts are executable
RUN chmod +x ./scripts/*.py

# Create the test directory and empty PDF file for pdf-parse (as a fallback)
RUN mkdir -p node_modules/pdf-parse/test/data && \
    touch node_modules/pdf-parse/test/data/05-versions-space.pdf

# Install Python and set up a virtual environment for dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    python3 -m venv /opt/venv

# Activate virtual environment and install dependencies
ENV PATH="/opt/venv/bin:$PATH"
RUN pip3 install --no-cache-dir -r scripts/requirements.txt

# Expose the port the app runs on
EXPOSE 3500

# Define command to run the application
CMD ["node", "index.js"] 