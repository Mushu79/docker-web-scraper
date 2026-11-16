const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Normalizes and validates the target URL.
 * Defaults to 'https://example.com' if not provided.
 */
function resolveTargetUrl() {
  const rawUrl = process.argv[2] || process.env.SCRAPE_URL || 'https://example.com';
  let target = rawUrl.trim();
  if (!/^https?:\/\//i.test(target)) {
    target = 'https://' + target;
  }
  return target;
}

/**
 * Finds the Chromium executable path when running inside Docker or custom environments.
 */
function resolveChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ];
  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined; // Puppeteer will fall back to its bundled browser if available
}

async function scrape() {
  const targetUrl = resolveTargetUrl();
  const outputFile = process.env.OUTPUT_FILE || path.join(__dirname, 'scraped_data.json');
  const chromiumPath = resolveChromiumPath();

  console.log('='.repeat(60));
  console.log('[SCRAPER] Initiating Puppeteer scraping job');
  console.log(`[SCRAPER] Target URL        : ${targetUrl}`);
  console.log(`[SCRAPER] Output File       : ${outputFile}`);
  console.log(`[SCRAPER] Chromium Binary   : ${chromiumPath || 'Puppeteer Default'}`);
  console.log('='.repeat(60));

  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  };

  if (chromiumPath) {
    launchOptions.executablePath = chromiumPath;
  }

  let browser;
  try {
    console.log('[SCRAPER] Launching headless browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Set standard viewport and modern User-Agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );

    console.log(`[SCRAPER] Navigating to ${targetUrl}...`);
    const response = await page.goto(targetUrl, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 30000
    });

    const httpStatus = response ? response.status() : 200;
    const finalUrl = page.url();
    console.log(`[SCRAPER] Page loaded with HTTP status: ${httpStatus}`);

    // Extract page metadata and contents
    console.log('[SCRAPER] Extracting structured data from DOM...');
    const extractedData = await page.evaluate(() => {
      // 1. Page Title
      const title = document.title ? document.title.trim() : null;

      // 2. First Heading (h1)
      const firstH1Element = document.querySelector('h1');
      const firstHeading = firstH1Element ? firstH1Element.innerText.trim() : null;

      // 3. Headings collection (h1, h2, h3)
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .slice(0, 10)
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.innerText.trim()
        }))
        .filter(item => item.text.length > 0);

      // 4. Meta tags (description, keywords, og tags)
      const getMeta = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.getAttribute('content') : null;
      };

      const meta = {
        description: getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]'),
        keywords: getMeta('meta[name="keywords"]'),
        ogTitle: getMeta('meta[property="og:title"]'),
        author: getMeta('meta[name="author"]')
      };

      // 5. Links sample
      const links = Array.from(document.querySelectorAll('a[href]'));
      const sampleLinks = links.slice(0, 5).map(a => ({
        text: a.innerText.trim() || a.getAttribute('title') || 'Link',
        href: a.href
      }));

      // 6. Text content sample
      const bodyText = document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : '';
      const textSample = bodyText.substring(0, 300) + (bodyText.length > 300 ? '...' : '');

      return {
        title,
        firstHeading,
        headings,
        meta,
        totalLinks: links.length,
        sampleLinks,
        textSample
      };
    });

    const resultPayload = {
      targetUrl,
      resolvedUrl: finalUrl,
      httpStatus,
      scrapedAt: new Date().toISOString(),
      ...extractedData
    };

    // Write output to file
    fs.writeFileSync(outputFile, JSON.stringify(resultPayload, null, 2), 'utf-8');

    console.log('[SCRAPER] Successfully scraped and extracted data:');
    console.log(`          - Title         : "${resultPayload.title}"`);
    console.log(`          - First Heading : "${resultPayload.firstHeading}"`);
    console.log(`          - Headings Count: ${resultPayload.headings.length}`);
    console.log(`          - Total Links   : ${resultPayload.totalLinks}`);
    console.log(`[SCRAPER] Output saved to: ${outputFile}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('[SCRAPER ERROR] An error occurred during scraping:', error.message);

    // Save fallback JSON with error details so downstream stage has valid JSON
    const errorPayload = {
      targetUrl,
      scrapedAt: new Date().toISOString(),
      error: error.message,
      title: null,
      firstHeading: null
    };
    fs.writeFileSync(outputFile, JSON.stringify(errorPayload, null, 2), 'utf-8');
    if (process.env.SCRAPE_ALLOW_FAILURE === 'true') {
      console.warn('[SCRAPER WARNING] SCRAPE_ALLOW_FAILURE=true: Exiting with code 0 despite error.');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('[SCRAPER] Browser closed cleanly.');
    }
  }
}

scrape();
