# ==============================================================================
# Multi-Stage Dockerfile: Node.js/Puppeteer Scraper + Python/Flask Content Host
# ==============================================================================

# ------------------------------------------------------------------------------
# STAGE 1: Scraper Stage (Node.js + Headless Chromium + Puppeteer)
# ------------------------------------------------------------------------------
FROM node:18-slim AS scraper

# Set working directory
WORKDIR /app

# Configure Puppeteer and Debian non-interactive environment
# - Skip downloading bundled Chromium to keep build lean and use system-installed version
# - Explicitly specify the Debian Chromium binary path
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DEBIAN_FRONTEND=noninteractive

# Install Chromium browser, fonts, and required shared libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy the scraper script
COPY scrape.js ./

# Define build argument for target URL with fallback default
ARG SCRAPE_URL=https://example.com
ENV SCRAPE_URL=${SCRAPE_URL}

# Execute scraping during build stage to generate scraped_data.json
RUN node scrape.js

# Default command for the scraper stage (if run directly as a target)
CMD ["node", "scrape.js"]

# ------------------------------------------------------------------------------
# STAGE 2: Final Stage (Lean Python Web Server hosting scraped content)
# ------------------------------------------------------------------------------
FROM python:3.10-slim AS final

# Set working directory
WORKDIR /app

# Configure Python execution environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000

# Install Flask dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Flask server code
COPY server.py ./

# Copy ONLY the scraped JSON artifact from the scraper stage
COPY --from=scraper /app/scraped_data.json ./scraped_data.json

# Expose port for the web server
EXPOSE 5000

# Container health check verifying server responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health').read()" || exit 1

# Start the Python web server
CMD ["python", "server.py"]
