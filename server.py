import json
import os
import sys
from flask import Flask, jsonify, Response, render_template_string

app = Flask(__name__)

# Path to the scraped JSON data
DATA_FILE_PATH = os.environ.get("DATA_FILE_PATH", os.path.join(os.path.dirname(__file__), "scraped_data.json"))

def load_scraped_data():
    """Loads and returns the scraped data from the JSON file."""
    if not os.path.exists(DATA_FILE_PATH):
        return None, f"Scraped data file not found at: {DATA_FILE_PATH}"
    try:
        with open(DATA_FILE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data, None
    except Exception as e:
        return None, f"Failed to parse JSON file: {str(e)}"

@app.route("/", methods=["GET"])
def get_scraped_data():
    """
    Main endpoint serving the scraped content as JSON.
    Returns HTTP 200 with JSON payload when file exists.
    Returns HTTP 404 with error message if file is missing.
    """
    data, error = load_scraped_data()
    if error:
        return jsonify({
            "status": "error",
            "message": error,
            "data_file": DATA_FILE_PATH
        }), 404

    # Returning formatted JSON response with 2-space indentation
    response_json = json.dumps(data, indent=2, ensure_ascii=False)
    return Response(response_json, mimetype="application/json; charset=utf-8")

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint for container orchestrators and Docker HEALTHCHECK."""
    data_present = os.path.exists(DATA_FILE_PATH)
    return jsonify({
        "status": "healthy" if data_present else "degraded",
        "scraped_data_file": DATA_FILE_PATH,
        "scraped_data_present": data_present
    }), (200 if data_present else 503)

@app.route("/preview", methods=["GET"])
def html_preview():
    """Visual HTML preview for easy inspection in desktop web browsers."""
    data, error = load_scraped_data()
    if error:
        return f"<h1>Error</h1><p>{error}</p>", 404

    html_template = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Scraped Data Preview</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; background: #f8fafc; color: #1e293b; }
            .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 900px; margin: 0 auto; }
            h1 { color: #2563eb; margin-top: 0; }
            .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; background: #e0e7ff; color: #3730a3; }
            pre { background: #1e293b; color: #f8fafc; padding: 1.25rem; border-radius: 6px; overflow-x: auto; font-size: 0.9rem; }
            .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
            .info-item { background: #f1f5f9; padding: 1rem; border-radius: 6px; }
            .info-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: bold; }
            .info-val { font-size: 1.1rem; font-weight: 600; margin-top: 0.25rem; }
            a { color: #2563eb; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="card">
            <span class="badge">Multi-Stage Docker Scraper</span>
            <h1>{{ data.get('title') or 'No Title Found' }}</h1>
            
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Target URL</div>
                    <div class="info-val"><a href="{{ data.get('targetUrl') }}" target="_blank">{{ data.get('targetUrl') }}</a></div>
                </div>
                <div class="info-item">
                    <div class="info-label">First Heading (H1)</div>
                    <div class="info-val">{{ data.get('firstHeading') or 'None' }}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">HTTP Status</div>
                    <div class="info-val">{{ data.get('httpStatus') }}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Scraped At</div>
                    <div class="info-val">{{ data.get('scrapedAt') }}</div>
                </div>
            </div>

            <h3>Raw JSON Output (<a href="/">View API JSON at /</a>):</h3>
            <pre><code>{{ raw_json }}</code></pre>
        </div>
    </body>
    </html>
    """
    raw_json = json.dumps(data, indent=2, ensure_ascii=False)
    return render_template_string(html_template, data=data, raw_json=raw_json)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 60)
    print(f"[SERVER] Starting Flask content hosting service on port {port}")
    print(f"[SERVER] Scraped data source: {DATA_FILE_PATH}")
    print(f"[SERVER] JSON Endpoint      : http://0.0.0.0:{port}/")
    print(f"[SERVER] HTML Preview       : http://0.0.0.0:{port}/preview")
    print(f"[SERVER] Health Check       : http://0.0.0.0:{port}/health")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port)
