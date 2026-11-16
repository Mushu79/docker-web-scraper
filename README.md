# Multi-Stage Docker Web Scraper & Content Hosting Service

A production-ready, multi-stage Docker application demonstrating the combined power of **Node.js with Puppeteer & Headless Chromium** for robust browser automation and **Python with Flask** for lightweight, high-performance content delivery.

---

## Architecture Overview

```
+---------------------------------------------------------------------------+
| Stage 1: Scraper Stage (node:18-slim)                                    |
| - Installs system Chromium & typography fonts                             |
| - Configures PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true                        |
| - Executes scrape.js with dynamic SCRAPE_URL                              |
| - Extracts page title, headings, metadata, and link samples               |
| - Generates artifact: /app/scraped_data.json                              |
+---------------------------------------------------------------------------+
                                     |
                         [ COPY --from=scraper ]
                     (scraped_data.json artifact only)
                                     v
+---------------------------------------------------------------------------+
| Stage 2: Final Hosting Stage (python:3.10-slim)                           |
| - Discards Node.js, npm, Chromium binary, and apt dependencies (~1.2GB)   |
| - Minimal Python runtime (~130MB total image size)                        |
| - Hosts scraped content via Flask (server.py)                             |
| - Exposes port 5000 (Endpoints: /, /health, /preview)                     |
+---------------------------------------------------------------------------+
```

---

## Features

- **Multi-Stage Build Isolation**: Heavy browser dependencies (Chromium, Node.js, and font libraries) exist exclusively in the build stage and are discarded. The final runtime image contains only Python, Flask, and the JSON artifact.
- **Dynamic URL Scraping**: Target any URL at build time using `--build-arg SCRAPE_URL="<url>"` or via environment variables and CLI arguments for local/standalone execution.
- **Resilient Headless Chromium**: Configured with essential container flags (`--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, and modern headless mode).
- **Extensible Content Extraction**: Extracts page title, first `<h1>` heading, DOM heading structure (`h1`, `h2`, `h3`), OpenGraph & meta tags, total link counts, and text previews.
- **Lean Python Web Server**: Serves raw JSON data at `/`, a system health check at `/health`, and a browser-friendly visual preview at `/preview`.

---

## Project Structure

```
.
├── Dockerfile              # Multi-stage build definition (Node scraper -> Python host)
├── scrape.js               # Puppeteer automation script for headless Chromium
├── server.py               # Flask application serving scraped JSON and preview
├── package.json            # Node.js dependencies (puppeteer)
├── requirements.txt        # Python dependencies (flask)
├── run_without_docker.bat  # 1-click Windows Batch runner (Runs without Docker)
├── run_without_docker.ps1  # 1-click Windows PowerShell runner (Runs without Docker)
├── scraped_data.json       # Initial/sample scraped data artifact
├── .dockerignore           # Excludes local artifacts & node_modules from context
└── README.md               # Setup and usage documentation
```

---

## Running Locally on Windows (Without Docker)

If you do not have Docker or Docker Desktop running on Windows, you can execute the entire pipeline natively on your machine using the automated scripts:

### Option A: Using PowerShell
```powershell
# Scrapes default URL (https://example.com) and starts Flask server
.\run_without_docker.ps1

# Or specify a custom URL
.\run_without_docker.ps1 -TargetUrl "https://news.ycombinator.com"
```

### Option B: Using Command Prompt / Batch
```cmd
:: Scrapes default URL
run_without_docker.bat

:: Or specify a custom URL
run_without_docker.bat "https://news.ycombinator.com"
```

### Option C: Manual Commands
```bash
# 1. Scrape target page
npm install
node scrape.js "https://example.com"

# 2. Host the scraped content
pip install -r requirements.txt
python server.py
```
Open `http://localhost:5000/` in your browser.

---

## Quick Start (Docker)

### 1. Build the Docker Image

#### Default Build (scrapes `https://example.com`)
```bash
docker build -t scraper-host .
```

#### Dynamic URL Build (Custom URL via build-arg)
Pass the desired target URL using the `SCRAPE_URL` build argument:
```bash
docker build --build-arg SCRAPE_URL="https://news.ycombinator.com" -t scraper-host .
```

Another example:
```bash
docker build --build-arg SCRAPE_URL="https://en.wikipedia.org/wiki/Docker_(software)" -t scraper-host .
```

During the build process, you will see output from the scraper stage:
```
[SCRAPER] Initiating Puppeteer scraping job
[SCRAPER] Target URL        : https://news.ycombinator.com
[SCRAPER] Launching headless browser...
[SCRAPER] Page loaded with HTTP status: 200
[SCRAPER] Successfully scraped and extracted data:
          - Title         : "Hacker News"
          - First Heading : "Hacker News"
[SCRAPER] Output saved to: /app/scraped_data.json
```

---

### 2. Run the Container

Run the built image with port 5000 mapped to your host:
```bash
docker run -d --name scraper-app -p 5000:5000 scraper-host
```

To run interactively with log output:
```bash
docker run --rm -it -p 5000:5000 scraper-host
```

---

### 3. Access the Hosted Content

Once the container is running, access the web service using your browser, `curl`, or any HTTP client:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `http://localhost:5000/` | `GET` | **Main API Endpoint**: Returns the scraped content as structured JSON. |
| `http://localhost:5000/preview` | `GET` | **Browser View**: Visual HTML preview of the scraped page summary. |
| `http://localhost:5000/health` | `GET` | **Health Check**: Returns status 200 and verifies data file availability. |

#### Verify with `curl`:
```bash
# Fetch the scraped JSON data
curl -s http://localhost:5000/
```

#### Example JSON Response:
```json
{
  "targetUrl": "https://example.com",
  "resolvedUrl": "https://example.com/",
  "httpStatus": 200,
  "scrapedAt": "2026-11-16T12:00:00.000Z",
  "title": "Example Domain",
  "firstHeading": "Example Domain",
  "headings": [
    {
      "tag": "h1",
      "text": "Example Domain"
    }
  ],
  "meta": {
    "description": null,
    "keywords": null,
    "ogTitle": null,
    "author": null
  },
  "totalLinks": 1,
  "sampleLinks": [
    {
      "text": "More information...",
      "href": "https://www.iana.org/domains/example"
    }
  ],
  "textSample": "Example Domain This domain is for use in illustrative examples in documents..."
}
```

---

## Supplying the URL to Scrape

This project offers flexible mechanisms to supply the target URL:

### Method 1: Docker Multi-Stage Build Argument (Recommended)
This approach builds the final, ultralight image containing the freshly scraped target data:
```bash
docker build --build-arg SCRAPE_URL="https://github.com" -t scraper-host .
```

### Method 2: Standalone Scraper Stage Execution
You can target the `scraper` stage directly to scrape URLs on demand using runtime environment variables or CLI arguments:
```bash
# Build only the scraper stage
docker build --target scraper -t standalone-scraper .

# Run with environment variable
docker run --rm -e SCRAPE_URL="https://httpbin.org/html" standalone-scraper

# Or run with CLI argument and extract the file
docker run --rm -v $(pwd):/app/output standalone-scraper node scrape.js "https://httpbin.org/html"
```

### Method 3: Live Volume Mounting on the Python Server
If you have updated `scraped_data.json` locally or externally, mount it directly into the running container without rebuilding:
```bash
docker run -d -p 5000:5000 -v $(pwd)/scraped_data.json:/app/scraped_data.json scraper-host
```

---

## Local Development (Without Docker)

You can also run the scraper and server directly on your host machine if Node.js and Python are installed:

### Step 1: Run the Scraper (Node.js)
```bash
# Install dependencies
npm install

# Run scraper via CLI argument
node scrape.js "https://example.com"

# Or run scraper via environment variable
SCRAPE_URL="https://example.com" node scrape.js
```

### Step 2: Run the Web Server (Python)
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the Flask server
python server.py
```
Visit `http://localhost:5000/` in your browser.

---

## Image Size & Optimization Breakdown

By leveraging multi-stage builds, this project demonstrates significant image optimization:

| Image Layer / Stage | Components | Approximate Size |
| :--- | :--- | :--- |
| **Stage 1 (Scraper)** | Debian Base, Node.js 18, Chromium, Typography Fonts, X11/GL libs, Puppeteer | **~1,250 MB** |
| **Stage 2 (Final Host)** | Debian Base, Python 3.10-slim, Flask, `scraped_data.json` | **~135 MB** |
| **Savings** | **Eliminates ~90% of image size from the final deployment footprint** | **~89% reduction** |

---

## Configuration & Environment Variables

### Scraper Stage (`scrape.js`):
- `SCRAPE_URL`: URL of the page to scrape (fallback: `https://example.com` or CLI argument).
- `PUPPETEER_EXECUTABLE_PATH`: Path to system Chromium binary (default: `/usr/bin/chromium`).
- `OUTPUT_FILE`: Path where the scraped JSON is written (default: `scraped_data.json`).
- `SCRAPE_ALLOW_FAILURE`: Set to `true` to allow build continuation with an error payload if the target URL is unreachable.

### Hosting Stage (`server.py`):
- `PORT`: Web server listening port (default: `5000`).
- `DATA_FILE_PATH`: Path to the JSON data file to read and serve (default: `scraped_data.json`).
