addEventListener('fetch', event => {
  event.respondWith(handleEvent(event));
});

// --- CONFIGURATION ---

const SETTINGS = {
  // User-Agent برای ارسال به سرورهای هدف
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
  // انکودینگ پیش‌فرض خروجی ('base64' or 'hex')
  ENCODING: {
    default: 'base64',
    queryParam: 'encoding',
  },
  // کلید مخفی برای فعال‌سازی حالت دیباگ (برای امنیت بیشتر)
  DEBUG_SECRET: 'your-super-secret-debug-key-here', // <-- !!! حتماً این کلید را تغییر دهید
  // حداکثر زمان انتظار برای هر درخواست fetch (به میلی‌ثانیه)
  FETCH_TIMEOUT: 8000, // 5 ثانیه
  // حداکثر حجم محتوای قابل قبول از هر سرور (به بایت)
  MAX_CONTENT_LENGTH: 5 * 1024 * 1024, // 5 مگابایت
};

const TARGETS = [
  { host: 'ajax-cdn.xyz', port: '2096', pathPrefix: '/k2bfA3bQh8XcM7R9zn92/' },
  { host: 'it.ajax-cdn.xyz', port: '2096', pathPrefix: '/k2bfA3bQh8XcM7R9zn92/'},
  { host: 'hold.ajax-cdn.xyz', port: '2096', pathPrefix: '/k2bfA3bQh8XcM7R9zn92/' },
  { host: 'se.vip.ajax-cdn.xyz', port: '2096', pathPrefix: '/k2bfA3bQh8XcM7R9zn92/'},
  { host: 'sweden.vip.ajax-cdn.xyz', port: '2096', pathPrefix: '/k2bfA3bQh8XcM7R9zn92/' },
];

// هدرهای استاندارد CORS برای پاسخ‌ها
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
};


const EXTRA_SUB_CONFIGS = [
  `vmess://eyJhZGQiOiJzZXJrYXQub3JnIiwiYWlkIjoiMCIsImFscG4iOiIiLCJmcCI6IiIsImhvc3QiOiJzZXJrYXQub3JnIiwiaWQiOiIwM2ZjYzYxOC1iOTNkLTY3OTYtNmFlZC04YTM4Yzk3NWQ1ODEiLCJuZXQiOiJ3cyIsInBhdGgiOiJsaW5rdndzIiwicG9ydCI6IjQ0MyIsInBzIjoi8J+UsCBQdWJsaWMgU2VydmVyIiwic2N5IjoiYXV0byIsInNuaSI6InNlcmthdC5vcmciLCJ0bHMiOiJ0bHMiLCJ0eXBlIjoiLS0tIiwidiI6IjIifQ==`,
  `vless://df0680ca-e43c-498d-ed86-8e196eedd012@638946986851076125.hamedan-drc-tusabl.info:8880?mode=gun&security=none&encryption=none&type=grpc#%F0%9F%87%A8%F0%9F%87%B5%20%20Nitro%203`,
  `vless://8e4ec018-b237-48ef-a09b-c8c2b2cee74b@m37a.vip784.com:33801?security=none&encryption=none&host=varzesh3.ir&headerType=http&type=tcp#%F0%9F%87%A8%F0%9F%87%B5%20%20Nitro%202`,
  `vless://df0680ca-e43c-498d-ed86-8e196eedd012@194.4.49.16:8880?mode=gun&security=none&encryption=none&authority=%2F%3FBIA_TELEGRAM%40MARAMBASHI_MARAMBASHI_MARAMBASHI_MARAMBASHI&type=grpc#%F0%9F%87%A8%F0%9F%87%B5%20%20Nitro`,
];

/**
 * ✅ NEW HELPER FUNCTION TO FIX "MANY CONFIGS" PROBLEM
 * Parses HTML content to extract subscription links found within a specific textarea.
 * This prevents the entire HTML page from being included in the final output.
 * @param {string} htmlContent The full HTML content from the target server.
 * @returns {string|null} The extracted subscription links as a single string, or null if not found.
 */
function extractSubscriptionLinks(htmlContent) {
  // A simple but effective regex to find the content inside:
  // <textarea id="subscription-links" style="display:none">  ...  </textarea>
  const regex = /<textarea\s+id="subscription-links"[^>]*>([\s\S]*?)<\/textarea>/;
  const match = htmlContent.match(regex);

  // If a match is found, return the content inside the textarea (group 1).
  // We also trim it to remove any leading/trailing whitespace.
  if (match && match[1]) {
    return match[1].trim();
  }

  // Return null if the textarea was not found.
  return null;
}


const inFlightRequests = new Map();
// --- CACHING LAYER (IMPROVED) ---

/**
 * Main event handler with a robust caching layer.
 * Normalizes cache keys for higher hit rates.
 * @param {FetchEvent} event The fetch event.
 */
async function handleEvent(event) {
  const request = event.request;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cache = caches.default;

  // Try combined cache first
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    console.log(`Cache HIT for: ${request.url}`);
    const newHeaders = new Headers(cachedResponse.headers);
    newHeaders.set('X-Cache-Status', 'HIT');
    Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers: newHeaders,
    });
  }

  console.log(`Cache MISS for: ${request.url}`);

  const url = request.url;
  let promise = inFlightRequests.get(url);

  if (promise) {
    console.log(`Request COALESCED for: ${url}. Awaiting in-flight request.`);
    const { buffer, status, statusText, headers } = await promise;
    return new Response(buffer, { headers, status, statusText });
  }

  promise = (async () => {
    // ⚠️ pass event down so per-target cache can use event.waitUntil
    const originalResponse = await handleRequest(request, event);

    const buffer = await originalResponse.arrayBuffer();

    const finalHeaders = new Headers(originalResponse.headers);
    finalHeaders.set('X-Cache-Status', 'MISS');

    // Cache the combined response with SWR
    if (originalResponse.status >= 200 && originalResponse.status < 300) {
      const cacheHeaders = new Headers(originalResponse.headers);
      cacheHeaders.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
      const cacheableResponse = new Response(buffer.slice(0), {
        status: originalResponse.status,
        statusText: originalResponse.statusText,
        headers: cacheHeaders,
      });
      event.waitUntil(cache.put(cacheKey, cacheableResponse));
    }

    return {
      buffer,
      status: originalResponse.status,
      statusText: originalResponse.statusText,
      headers: finalHeaders,
    };
  })();

  inFlightRequests.set(url, promise);
  promise.finally(() => inFlightRequests.delete(url));

  const { buffer, status, statusText, headers } = await promise;
  return new Response(buffer, { headers, status, statusText });
}

/**
 * Core logic handler. Tries ID extraction strategies sequentially.
 * It will only fall back to the next strategy if ALL fetches for the current ID fail.
 * @param {Request} request The incoming request.
 * @returns {Promise<Response>}
 */
async function handleRequest(request, event) {
  if (request.method === 'OPTIONS') {
    const safeCorsHeaders = typeof corsHeaders === 'object' ? corsHeaders : {};
    return new Response(null, { status: 204, headers: safeCorsHeaders });
  }
  if (request.method !== 'GET') {
    const safeCorsHeaders = typeof corsHeaders === 'object' ? corsHeaders : {};
    console.warn(`[SECURITY] Attempted method ${request.method} blocked.`);
    return new Response('Method Not Allowed. Only GET requests are supported.', { status: 405, headers: safeCorsHeaders });
  }

  const context = parseRequestContext(request);
  console.log(`Processing request for path: ${context.url.pathname}`);

  const idExtractionStrategies = [idFromPathPrefix, idFromFullPath, idFromQueryParam, idFromLastPathSegment];

  let finalProcessedData = null;

  for (const strategy of idExtractionStrategies) {
    let potentialSubId;
    try {
      potentialSubId = strategy(context);
    } catch (e) {
      console.error(`[ERROR] ID Strategy '${strategy.name}' failed:`, e.message);
      continue;
    }

    if (!potentialSubId) continue;

    console.log(`Algorithm '${strategy.name}' found a potential ID: [ID Length: ${potentialSubId.length}]. Validating by fetching...`);

    let fetchResults;
    try {
      // ⚠️ event is passed here so per-target cache can be written asynchronously
      fetchResults = await performFetches(potentialSubId, request.headers, event);
    } catch (e) {
      if (e instanceof FetchError && e.type === 'security') {
        console.warn(`[SECURITY] Rejected ID from strategy ${strategy.name} due to internal validation: ${e.message}`);
      } else {
        console.error(`[ERROR] performFetches failed for ID from ${strategy.name}: ${e.message}`);
      }
      continue;
    }

    const processedData = await processResults(fetchResults, potentialSubId);

    if (processedData.hadAnySuccess) {
      console.log(`SUCCESS: Received a valid response for the ID from algorithm '${strategy.name}'. Stopping here.`);
      finalProcessedData = processedData;
      break;
    } else {
      console.log(`INFO: All fetches failed for ID from algorithm '${strategy.name}'. Trying next strategy...`);
    }
  }

  if (finalProcessedData) {
    const hasContent = (finalProcessedData.jsonContents?.length || 0) > 0 ||
                       (finalProcessedData.otherContents?.length || 0) > 0;
    if (hasContent) {
      return buildResponse(finalProcessedData, context);
    } else {
      const safeCorsHeaders = typeof corsHeaders === 'object' ? corsHeaders : {};
      console.log("INFO: Successful connection, but content was empty. Returning 204.");
      return new Response(null, { status: 204, headers: safeCorsHeaders });
    }
  } else {
    console.log("FAILURE: No valid subscription ID found or all targets failed. Returning DPI page.");
    return generateDpiNotFoundResponse(request);
  }
}
async function safeFetchOrCache(forwardUrl, forwardHeaders, event) {
  const cache = caches.default;
  const cacheKey = new Request(forwardUrl, { method: 'GET' });

  // Serve from cache first if present
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached; // cached Response
  }

  // No cache -> fetch live with timeout
  const liveReq = new Request(forwardUrl, {
    method: 'GET',
    headers: forwardHeaders,
    redirect: 'manual',
  });

  try {
    const live = await fetchWithTimeout(liveReq, { timeout: SETTINGS.FETCH_TIMEOUT, retries: 2 });

    // Cache only if OK; attach SWR so future misses can use stale
    if (live.ok) {
      const h = new Headers(live.headers);
      h.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
      const cacheable = new Response(await live.clone().arrayBuffer(), {
        status: live.status,
        statusText: live.statusText,
        headers: h,
      });
      // write asynchronously
      if (event && typeof event.waitUntil === 'function') {
        event.waitUntil(cache.put(cacheKey, cacheable));
      } else {
        // fallback: block if event not available
        await cache.put(cacheKey, cacheable);
      }
    }

    return live;

  } catch (err) {
    // If network fails, last chance: stale cache
    const fallback = await cache.match(cacheKey);
    if (fallback) return fallback;
    throw err;
  }
}


/**
 * Parses request context and performs security checks.
 * @param {Request} request
 * @returns {object}
 */
function parseRequestContext(request) {
  // --- Security Improvement 1: Absolute Robustness Check ---
  // Ensure we have a valid request object structure before attempting URL parsing.
  if (!request || typeof request.url !== 'string') {
    // If request is fundamentally broken, return a safe, empty context.
    return {
      url: new URL('https://safety-fallback.com/'), 
      params: new URLSearchParams(), 
      isDebugMode: false, 
      encoding: SETTINGS.ENCODING.default || 'base64',
    };
  }

  try {
    const url = new URL(request.url);
    const params = url.searchParams;
    
    // Safely retrieve configuration defaults
    const encodingQueryParam = SETTINGS.ENCODING?.queryParam || 'encoding';
    const defaultEncoding = SETTINGS.ENCODING?.default || 'base64';
    
    const requestedEncoding = params.get(encodingQueryParam)?.toLowerCase();
    
    // ✅ Core Logic Maintenance: Secure Debug Check
    const debugSecret = SETTINGS.DEBUG_SECRET;
    // Check if key matches AND strongly discourage the use of the default placeholder key
    const isDebugMode = (params.get('debug') === debugSecret) && (debugSecret && debugSecret !== 'your-super-secret-debug-key-here');
    
    if(params.get('debug') && !isDebugMode) {
      // Log failed attempts safely
      const clientIp = request.headers?.get('cf-connecting-ip') || 'unknown';
      console.warn(`[SECURITY] Forbidden Debug Attempt. IP: ${clientIp}. Key mismatch or default key in use.`);
    }

    // Strict validation and sanitization for encoding output
    const safeEncoding = ['hex', 'base64'].includes(requestedEncoding) ? requestedEncoding : defaultEncoding;

    return {
      url,
      params,
      isDebugMode,
      encoding: safeEncoding,
    };
  } catch (e) {
    // --- Security Improvement 2: Catch Parsing Failures ---
    // If URL parsing or configuration access fails, log the error and return a safe context.
    console.error(`[FATAL] Exception during parseRequestContext for ${request.url}: ${e.message}`);
    return {
      url: new URL('https://safety-fallback.com/exception'), 
      params: new URLSearchParams(), 
      isDebugMode: false, 
      encoding: SETTINGS.ENCODING.default || 'base64',
    };
  }
}


function idFromPathPrefix({ url }) {
  // ✅ Security/Robustness Check 1: Validate input object structure
  if (!url || typeof url.pathname !== 'string') {
    console.warn("idFromPathPrefix: Invalid URL object or pathname provided.");
    return null;
  }

  const pathname = url.pathname;

  // ✅ Security/Robustness Check 2: Validate TARGETS configuration
  if (!Array.isArray(TARGETS) || TARGETS.length === 0) {
    // This is defensive coding; in a live Worker, TARGETS should always be defined.
    console.error("idFromPathPrefix: TARGETS configuration is missing or invalid.");
    return null;
  }

  // Find the first target configuration where the URL pathname starts with its prefix.
  const matchingTarget = TARGETS.find(target => {
    // Robustness: Ensure target and prefix are valid strings before calling startsWith
    const prefix = target?.pathPrefix;
    // We only proceed if the prefix is a non-empty string
    return typeof prefix === 'string' && prefix.length > 0 && pathname.startsWith(prefix);
  });

  // If no target matches, return null immediately.
  if (!matchingTarget) {
    return null;
  }

  // Extract the part of the path after the prefix.
  // Core logic is maintained here: substring.
  let potentialId = pathname.substring(matchingTarget.pathPrefix.length);
  
  // ✅ Sanitization: Clean leading/trailing slashes and trim whitespace aggressively.
  // This helps prevent accidental whitespace injection.
  potentialId = potentialId.replace(/^\/+|\/+$/g, '').trim();
  
  // Ensure an empty result (e.g., for "/prefix/") becomes null.
  return potentialId || null;
}

/**
 * ALGORITHM 2: ID from the Full Path
 * A simplified and robust version that cleans the path and returns null if the result is empty.
 * @param {{url: URL}} context - The request context.
 * @returns {string|null} The cleaned ID or null.
 */
function idFromFullPath({ url }) {
  // ✅ Security/Robustness Check 1: Validate input object structure
  if (!url || typeof url.pathname !== 'string') {
    console.warn("idFromFullPath: Invalid URL object or pathname provided.");
    return null;
  }

  // Remove all leading and trailing slashes from the pathname.
  // Core logic maintained.
  let cleanedPath = url.pathname.replace(/^\/+|\/+$/g, '');
  
  // ✅ Sanitization: Trim any remaining whitespace (e.g., if the path contained spaces)
  cleanedPath = cleanedPath.trim();
  
  // If the path was only slashes (e.g., "/" or "//") or only whitespace, cleanedPath will be an empty string.
  // The `||` operator correctly converts this falsy empty string to `null`.
  return cleanedPath || null;
}

/**
 * ALGORITHM 3: ID from a Query Parameter
 * A more scalable and robust version that iterates over a defined list of keys.
 * It also correctly handles parameters that exist but are empty or only contain whitespace.
 * @param {{params: URLSearchParams}} context - The request context.
 * @returns {string|null} The trimmed ID or null.
 */
/**
 * ALGORITHM 3: ID from a Query Parameter
 * Extracts the ID from a predefined list of query keys, ensuring sanitization.
 * @param {{params: URLSearchParams}} context - The request context containing the URLSearchParams object.
 * @returns {string|null} The trimmed and cleaned ID or null.
 */
function idFromQueryParam({ params }) {
  // ✅ Security/Robustness Check 1: Validate input object structure
  // Ensure 'params' is a valid object before attempting to use it.
  if (!params || typeof params.get !== 'function') {
    console.warn("idFromQueryParam: Invalid URLSearchParams object provided.");
    return null;
  }

  // Define a list of possible keys. Core logic maintained.
  const ID_QUERY_KEYS = ['id', 'sub', 'subscription', 'url', 'uri'];

  for (const key of ID_QUERY_KEYS) {
    // Optional Chaining (`?.`) is used for safety, followed by mandatory trimming.
    const rawValue = params.get(key);
    
    // Check for null or undefined early for minor optimization
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    // ✅ Sanitization: Aggressively trim the value
    const value = String(rawValue).trim();
    
    // Check if the value is "truthy" after trimming (i.e., not an empty string).
    if (value) {
      // ✅ Security Check 2: Basic length validation before return (Defense in Depth)
      // This is a quick check; detailed validation happens in performFetches.
      if (value.length > 256) { 
        console.warn(`idFromQueryParam: Potential ID for key '${key}' exceeds max safe length. Ignoring.`);
        continue;
      }
      
      // Found a valid, sanitized ID
      return value;
    }
  }
  
  // If the loop completes without finding a valid ID, return null.
  return null;
}


/**
 * ALGORITHM 4: ID from the Last Path Segment
 * Uses modern array method `.at(-1)` for expressiveness and the Nullish Coalescing Operator (`??`)
 * for robust handling of empty results.
 * @param {{url: URL}} context - The request context.
 * @returns {string|null} The last path segment or null.
 */

function idFromLastPathSegment({ url }) {
  // ✅ Security/Robustness Check 1: Validate input object structure
  if (!url || typeof url.pathname !== 'string') {
    console.warn("idFromLastPathSegment: Invalid URL object or pathname provided.");
    return null;
  }

  // Use a temporary variable for the pathname to ensure we are working with a string
  const pathname = url.pathname;
  
  // 1. Split the path into segments.
  // 2. Filter out empty strings caused by leading/trailing/multiple slashes (e.g., "/foo//bar/").
  // Core logic maintained.
  const segments = pathname.split('/').filter(Boolean);

  // Use `.at(-1)` to get the last element.
  let potentialId = segments.at(-1);

  // If found, ensure it's trimmed for safety.
  if (potentialId) {
    // ✅ Sanitization: Trim any surrounding whitespace
    potentialId = potentialId.trim();
  }

  // The Nullish Coalescing Operator (`??`) converts `undefined` or `null` to the right-hand side.
  // If the result of trim() was an empty string, we return null.
  return potentialId || null;
}
// To save space, the bodies of these functions are omitted as they are unchanged.
// Assume they are the same as in the original code.


// --- Fetching and Processing (IMPROVED) ---
class FetchError extends Error {
  /**
   * @param {string} message - The error message.
   * @param {'timeout' | 'network' | 'http' | 'security'} type - The category of the error.
   * @param {{url?: string, status?: number, attempt?: number, context?: string}} [details={}] - Additional context.
   */
  constructor(message, type, details = {}) {
    // ✅ Safety: Ensure message is a string before passing to super
    super(String(message || 'An unknown fetch error occurred.'));
    
    // Restore prototype chain for correct instance behavior (standard practice for custom errors in ES6)
    // This addresses environments (like some worker runtimes) where extending Error might break the prototype chain.
    Object.setPrototypeOf(this, FetchError.prototype);
    
    // ✅ Security: Restrict type to known safe values, defaulting to 'network'
    const safeTypes = ['timeout', 'network', 'http', 'security'];
    this.name = 'FetchError';
    this.type = safeTypes.includes(type) ? type : 'network';
    
    // ✅ Robustness: Safely assign properties, ensuring types are correct
    this.url = typeof details.url === 'string' ? details.url : undefined;
    this.status = typeof details.status === 'number' && details.status > 0 ? details.status : undefined;
    this.attempt = typeof details.attempt === 'number' && details.attempt >= 1 ? details.attempt : undefined;
    
    // Add context for deeper debugging (e.g., 'ID validation failed')
    this.context = typeof details.context === 'string' ? details.context : undefined;
  }

  // Optional: Provide a clean string representation for logging
  toString() {
    return `[${this.name}:${this.type.toUpperCase()}] ${this.message} (URL: ${this.url || 'N/A'}${this.status ? `, Status: ${this.status}` : ''})`;
  }
}


const backoff = (attempt, baseDelay = 100) => {
  const delay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = delay * 0.2 * Math.random(); // Add up to 20% jitter
  const totalDelay = Math.min(delay + jitter, 2000); // Cap delay at 2 seconds
  return new Promise(resolve => setTimeout(resolve, totalDelay));
};

async function fetchWithTimeout(request, options = {}) {
  const {
    timeout = SETTINGS.FETCH_TIMEOUT ?? 5000,
    retries = 2,
    signal: externalSignal = null,
  } = options;

  const totalAttempts = 1 + retries;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    // controller used for this attempt so we can abort timeout+fetch together
    const attemptController = new AbortController();

    // if an external signal is provided, when it aborts, abort our attempt too
    let externalListener;
    if (externalSignal) {
      if (externalSignal.aborted) {
        // upstream already aborted
        throw new FetchError('Aborted by external signal before attempt', 'network', { url: request.url, attempt });
      }
      externalListener = () => attemptController.abort();
      externalSignal.addEventListener('abort', externalListener, { once: true });
    }

    // create a timeout that aborts this attempt
    const timeoutId = setTimeout(() => attemptController.abort(), timeout);

    try {
      // merge signals by passing the attemptController.signal to fetch. If externalSignal aborts,
      // we aborted attemptController above via listener.
      const response = await fetch(request, { signal: attemptController.signal });

      clearTimeout(timeoutId);
      if (externalListener && externalSignal) externalSignal.removeEventListener('abort', externalListener);

      // Retry on 5xx server errors
      if (!response.ok && response.status >= 500) {
        throw new FetchError(`Server error ${response.status}`, 'http', { url: request.url, status: response.status, attempt });
      }

      return response; // success (2xx or other non-5xx ok)

    } catch (err) {
      clearTimeout(timeoutId);
      if (externalListener && externalSignal) externalSignal.removeEventListener('abort', externalListener);

      // If external signal caused abort, bubble as network/abort
      if (externalSignal && externalSignal.aborted) {
        throw new FetchError('Aborted by external signal', 'network', { url: request.url, attempt });
      }

      // If last attempt, wrap or rethrow final error
      if (attempt === totalAttempts) {
        if (err instanceof FetchError) throw err;
        throw new FetchError(`Network error on final attempt: ${err?.message ?? err}`, 'network', { url: request.url, attempt });
      }

      // else: wait backoff and retry
      console.warn(`[RETRY] ${request.url} attempt ${attempt} failed: ${err?.message ?? err}. Retrying...`);
      await backoff(attempt);
      // continue loop for next attempt
    }
  }
}

function findBestId(context) {
  // List of extractor functions in order of baseline priority.
  const strategies = [idFromPathPrefix, idFromFullPath, idFromQueryParam, idFromLastPathSegment];

  // Evaluate all (they are sync) and collect non-null results.
  const candidates = strategies
    .map((fn, i) => ({ id: fn(context), strategy: fn.name, priority: i }))
    .filter(x => x.id !== null && x.id !== undefined);

  if (!candidates.length) return null;

  // Pick best candidate:
  // simple heuristic: prefer earlier strategy (smaller priority), then shorter id (less likely to be malformed)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.length - b.id.length;
  });

  return candidates[0]; // { id, strategy, priority }
}


const ALLOWED_FORWARD_HEADERS = [
  'accept',
  'accept-language',
  'accept-encoding', // Important for receiving compressed content
];

/**
 * Executes fetches to all targets in parallel with timeouts, input validation, and header sanitization.
 * This function is hardened against common web vulnerabilities.
 *
 * @param {string} subId The subscription ID. It will be validated before use.
 * @param {Headers} originalHeaders Headers from the original incoming request.
 * @returns {Promise<PromiseSettledResult<Response>[]>} An array of settled promises for each fetch attempt.
 * @throws {Error} Throws an error if the subId is determined to be invalid, which should be caught by the calling function.
 */
function performFetches(subId, originalHeaders, event) {
  if (typeof subId !== 'string' || subId.trim() === '') {
    throw new Error('Invalid subscription ID: Cannot be empty.');
  }
  if (subId.length > 256) {
    throw new Error('Invalid subscription ID: Exceeds maximum length of 256 characters.');
  }
  const validIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!validIdRegex.test(subId)) {
    throw new Error('Invalid subscription ID: Contains disallowed characters. Responding with 403 Forbidden.');
  }

  console.log(`Fetching from ${TARGETS.length} targets for validated ID.`);

  const promises = TARGETS.map(target => {
    try {
      const forwardUrl = `https://${target.host}:${target.port}${target.pathPrefix}${subId}`;

      // strict header whitelist
      const forwardHeaders = new Headers();
      for (const name of ALLOWED_FORWARD_HEADERS) {
        if (originalHeaders.has(name)) {
          forwardHeaders.set(name, originalHeaders.get(name));
        }
      }
      forwardHeaders.set('Host', target.host);
      forwardHeaders.set('User-Agent', SETTINGS.userAgent);
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        forwardHeaders.set('X-Request-ID', crypto.randomUUID());
      }

      // 👇 use resilient per-target fetch with cache + SWR + fallback
      return safeFetchOrCache(forwardUrl, forwardHeaders, event);

    } catch (error) {
      console.error(`[FATAL] Failed to create fetch request for target ${target.host}:`, error.message);
      return Promise.reject(new Error(`Request construction failed for ${target.host}.`));
    }
  });

  // keep allSettled so one failure doesn't kill others
  return Promise.allSettled(promises);
}
/**
 * Processes fetch results and determines if any single fetch was successful.
 * @param {PromiseSettledResult<Response>[]} results
 * @param {string} subId
 * @returns {Promise<object>} An object containing processed content and a success flag.
 */
async function processResults(results, subId) {
  const processed = {
    jsonContents: [],
    otherContents: [],
    sources: [],
    debugInfo: [],
    hadAnySuccess: false,
  };

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const target = TARGETS[i];
    const redactedUrl = `https://${target.host}:${target.port}${target.pathPrefix}[REDACTED]`;

    if (result.status === 'fulfilled') {
      const response = result.value;
      processed.debugInfo.push({ target: redactedUrl, status: 'fulfilled', httpStatus: response.status });

      // treat cached 200s the same as fresh 200s
      if (response.ok) {
        processed.hadAnySuccess = true;

        const len = response.headers.get('content-length');
        if (len && parseInt(len, 10) > SETTINGS.MAX_CONTENT_LENGTH) {
          console.warn(`Content from ${target.host} exceeds max size limit. Skipping.`);
          processed.debugInfo.at(-1).details = 'Content too large';
          continue;
        }

        const fullContent = await response.text();
        const extracted = extractSubscriptionLinks(fullContent);
        const content = extracted !== null ? extracted : fullContent;

        if (content) {
          const decoded = tryDecode(content);
          if (decoded) {
            const asJson = tryParseJson(decoded);
            if (asJson) processed.jsonContents.push(asJson);
            else processed.otherContents.push(decoded);
            processed.sources.push(target.host);
          }
        }
      }
    } else {
      const reason = typeof result.reason?.message === 'string' ? result.reason.message : String(result.reason || 'unknown');
      processed.debugInfo.push({ target: redactedUrl, status: 'rejected', reason });
    }
  }

  return processed;
}

function tryDecode(text) {
  try {
  // اگر ورودی رشته نیست، آن را به رشته تبدیل می‌کنیم
  const safeText = typeof text === 'string' ? text : String(text);
  // Trim کردن فضای اضافی
  const trimmedText = safeText.trim();
  
  // تلاش برای دیکد Base64 با تابع امن
  const decoded = b64DecodeUnicode(trimmedText);
  
  // اگر دیکد موفق بود، نتیجه را برگردان، در غیر اینصورت متن اصلی
  return decoded !== null ? decoded : trimmedText;
  } catch (err) {
  console.warn('tryDecode error:', err);
  return String(text || ''); // fallback امن
  }
  }


/**
 * Decodes a Base64 encoded string that may contain Unicode characters.
 * @param {string} str The Base64 encoded string.
 * @returns {string|null} The decoded string, or null if decoding fails.
 */
function b64DecodeUnicode(str) {
  try {
    // اگر ورودی رشته نیست، آن را به رشته تبدیل می‌کنیم
    const safeStr = typeof str === 'string' ? str : String(str);

    // ✅ SECURITY/ROBUSTNESS IMPROVEMENT: Preliminary Base64 check
    // 1. Must only contain Base64 characters, whitespace, and padding ('=')
    // 2. Length must be a multiple of 4 (after removing whitespace and padding)
    const base64Regex = /^[A-Za-z0-9+/=\s]*$/;
    if (!base64Regex.test(safeStr)) {
        // Skip if characters are clearly non-Base64, preventing an exception and noisy log.
        return null;
    }
    
    // Attempt standard Base64 decode
    const decoded = atob(safeStr);
    
    // Handle multibyte characters safely
    const percentEncoded = decoded.split('').map(c => {
      const code = c.charCodeAt(0);
      // We only percent-encode bytes that are outside the single-byte range, 
      // ensuring we handle potential corruption gracefully.
      if (code < 128) return c; // Standard ASCII character
      return '%' + code.toString(16).padStart(2, '0');
    }).join('');

    // Ensure we only call decodeURIComponent if there are percent encodings or if we trust the output
    // A quick check for percent signs improves robustness against invalid input
    if (percentEncoded.includes('%')) {
        return decodeURIComponent(percentEncoded);
    }
    
    // If no percent encoding was applied, return the standard decoded string
    return percentEncoded;

  } catch (err) {
    // This catches the InvalidCharacterError from atob, which is now rarer due to the regex check.
    // We suppress the console warning for standard InvalidCharacterError, as it's often non-critical
    // (but keep the warning for other fatal errors).
    if (! (err instanceof DOMException && err.name === 'InvalidCharacterError')) {
        console.warn('b64DecodeUnicode error:', err); 
    }
    return null; // fallback امن
  }
}


/**
 * Builds the final HTTP Response, adding CORS headers and (optionally) appending EXTRA_SUB_CONFIG.
 * Requires:
 *  - corsHeaders (object) to exist in scope
 *  - EXTRA_SUB_CONFIG (string) may be defined in global scope (optional)
 *  - b64EncodeUnicode and stringToHex helper functions in scope
 *
 * @param {object} processedData
 * @param {object} context
 * @returns {Response}
 */
function buildResponse(processedData = {}, context = {}) {
  try {
    // CORS headers ایمن
    let baseCors = {};
    try {
      baseCors = typeof corsHeaders === 'object' && corsHeaders !== null ? corsHeaders : {};
    } catch {
      baseCors = {};
    }

    const responseHeaders = new Headers({
      ...baseCors,
      'X-Combined-Sources': (() => {
        try {
          return [...new Set(processedData.sources || [])].join(', ');
        } catch {
          return '';
        }
      })(),
      'X-Output-Encoding': context.encoding || 'base64',
    });

    // نرمالایز extras
    const extrasRaw = Array.isArray(EXTRA_SUB_CONFIGS) ? EXTRA_SUB_CONFIGS : [];
    const extras = extrasRaw
      .filter(item => typeof item === 'string' && item.trim())
      .map(item => item.trim());

    if (extras.length > 0) {
      responseHeaders.set('X-Extra-Subscription', 'true');
      responseHeaders.set('X-Extra-Count', String(extras.length));
    }

    const hasJson = Array.isArray(processedData.jsonContents) && processedData.jsonContents.length > 0;
    const hasOther = Array.isArray(processedData.otherContents) && processedData.otherContents.length > 0;

    // حالت DEBUG
    if (context.isDebugMode) {
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8');

      const debugPayload = {
        debugInfo: processedData.debugInfo || [],
      };
      if (extras.length) debugPayload.extraSubscriptions = extras;

      return new Response(JSON.stringify(debugPayload, null, 2), {
        headers: responseHeaders,
        status: 200,
      });
    }

    // حالت JSON تنها
    if (hasJson && !hasOther) {
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8');

      let flattened = [];
      try {
        flattened = processedData.jsonContents.flat
          ? processedData.jsonContents.flat()
          : processedData.jsonContents.reduce((acc, v) => acc.concat(v), []);
      } catch {
        flattened = processedData.jsonContents || [];
      }

      const payload = { data: flattened };
      if (extras.length) payload.extra_subscriptions = extras;

      return new Response(JSON.stringify(payload, null, 2), {
        headers: responseHeaders,
        status: 200,
      });
    }

    // حالت Mixed / Plain Text
    responseHeaders.set('Content-Type', 'text/plain; charset=utf-8');

    const jsonAsText = hasJson
      ? processedData.jsonContents.map(item => {
          try {
            return JSON.stringify(item);
          } catch {
            return String(item);
          }
        })
      : [];

    const otherText = hasOther ? processedData.otherContents : [];
    let combinedPlainText = [...jsonAsText, ...otherText].join('\n').trim();

    if (extras.length) {
      const extrasJoined = extras.join('\n');
      combinedPlainText = combinedPlainText ? `${combinedPlainText}\n${extrasJoined}` : extrasJoined;
    }

    // Encode امن
    let responseBody;
    try {
      switch ((context.encoding || 'base64').toLowerCase()) {
        case 'hex':
          responseBody = typeof stringToHex === 'function'
            ? stringToHex(combinedPlainText)
            : combinedPlainText; // fallback
          break;
        case 'base64':
        default:
          responseBody = typeof b64EncodeUnicode === 'function'
            ? b64EncodeUnicode(combinedPlainText)
            : btoa(unescape(encodeURIComponent(combinedPlainText))); // fallback ساده
          break;
      }
    } catch {
      responseBody = combinedPlainText || '';
    }

    return new Response(responseBody, {
      headers: responseHeaders,
      status: 200,
    });
  } catch (err) {
    // خطای غیرمنتظره → fallback response
    const safeHeaders = new Headers({ 'Content-Type': 'text/plain; charset=utf-8' });
    return new Response(`Unexpected error in buildResponse: ${err?.message || err}`, {
      headers: safeHeaders,
      status: 500,
    });
  }
}


function stringToHex(str) {
  try {
    // اگر ورودی رشته نیست، آن را به رشته تبدیل می‌کنیم
    const safeStr = typeof str === 'string' ? str : String(str);

    let hex = '';
    for (let i = 0; i < safeStr.length; i++) {
      try {
        const charCode = safeStr.charCodeAt(i);
        const hexValue = charCode.toString(16);
        hex += hexValue.padStart(2, '0');
      } catch {
        // در صورت بروز خطا روی یک کاراکتر، آن را نادیده می‌گیریم
        hex += '00';
      }
    }

    return hex;
  } catch (err) {
    console.warn('stringToHex error:', err);
    return ''; // fallback امن
  }
}

function b64EncodeUnicode(str) {
  try {
    // اگر ورودی رشته نیست، تلاش می‌کنیم آن را به رشته تبدیل کنیم
    const safeStr = typeof str === 'string' ? str : String(str);

    // encodeURIComponent + تبدیل بایت‌ها به کاراکترها
    const encoded = encodeURIComponent(safeStr).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      try {
        return String.fromCharCode(parseInt(p1, 16));
      } catch {
        return ''; // اگر parseInt یا fromCharCode شکست، جایگزین خالی می‌کنیم
      }
    });

    return btoa(encoded); // باینری به base64
  } catch (err) {
    // هر خطای غیرمنتظره → fallback
    console.warn('b64EncodeUnicode error:', err);
    return ''; // یا fallback امن دیگری
  }
}


// --- UTILITY FUNCTIONS (IMPROVED) ---

/**
 * ✅ اصلاح isJson و robust parsing
 * Safely parses a string into a JSON object.
 * @param {string} str The string to parse.
 * @returns {object|null} The parsed object or null if invalid.
 */
function tryParseJson(str) {
  try {
    if (typeof str !== 'string' || !str.trim().startsWith('{') || !str.trim().endsWith('}')) {
        return null;
    }
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}
function generateDpiNotFoundResponse(request) {
  const url = new URL(request.url);

  // --- Dynamic Data ---
  const rayId = (Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10)).toLowerCase();
  const clientIp = request.headers.get('cf-connecting-ip') || '198.51.100.10';

  // --- HTML with Ultra-Premium UI ---
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Securing Your Connection...</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --brand-blue: #007cf0;
            --brand-green: #2ecc71;
            --brand-red: #e74c3c;
            --text-primary: #ffffff;
            --text-secondary: #a7b3c4;
            --border-color: rgba(255, 255, 255, 0.2);
            --card-bg: rgba(15, 23, 42, 0.7);
            --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        * { box-sizing: border-box; }

        html, body {
            font-family: var(--font-family);
            margin: 0;
            height: 100%;
            display: grid;
            place-items: center;
            background: #0f172a; /* Dark blue/black background */
            color: var(--text-primary);
            text-align: center;
            overflow: hidden;
        }

        /* --- 1. Dynamic Particle Background --- */
        #particle-canvas {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
        }

        .main-container {
            width: 100%;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            perspective: 1000px; /* For 3D tilt effect */
        }

        /* --- 2. Glassmorphism & 3D Tilt Card --- */
        .card {
            background: var(--card-bg);
            border-radius: 20px;
            border: 1px solid var(--border-color);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            max-width: 620px;
            width: 100%;
            padding: 56px;
            opacity: 0;
            transform: translateY(20px) scale(0.98);
            animation: card-fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            transition: transform 0.2s ease-out; /* For smooth tilt */
            transform-style: preserve-3d;
        }

        @supports not (backdrop-filter: blur(16px)) {
            .card { background: rgba(15, 23, 42, 0.9); }
        }

        @keyframes card-fade-in {
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* --- 3. Integrated SVG Progress Icon --- */
        .icon-container {
            margin-bottom: 32px;
            position: relative;
            width: 80px;
            height: 80px;
        }
        .secure-icon {
            width: 100%;
            height: 100%;
            transform: rotate(-90deg); /* Start circle from the top */
        }
        .progress-track, .progress-value, .icon-symbol {
            fill: none;
            stroke-width: 3;
            stroke-linecap: round;
        }
        .progress-track {
            stroke: rgba(255, 255, 255, 0.1);
        }
        .progress-value {
            stroke: var(--brand-blue);
            transition: stroke-dashoffset 0.5s ease-out, stroke 0.5s ease;
        }
        .icon-symbol {
            stroke: var(--text-secondary);
            stroke-width: 2.5;
            transition: opacity 0.3s ease, transform 0.3s ease, stroke 0.5s ease;
        }
        .icon-symbol.hidden {
            opacity: 0;
            transform: scale(0.5);
        }
        
        h1 {
            font-size: 2rem;
            font-weight: 600;
            margin: 0 0 16px;
            letter-spacing: -0.02em;
        }
        #main-status {
            height: 2.2em; /* Prevent layout shift */
            margin: 0;
        }
        #sub-status {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin: 8px 0 32px;
            height: 1.5em; /* Prevent layout shift */
            transition: color 0.5s ease;
        }

        /* --- 4. Error State Enhancement --- */
        .error-state {
            animation: card-shake 0.6s cubic-bezier(.36,.07,.19,.97) both;
        }
        .error-state .progress-value, .error-state .icon-symbol {
            stroke: var(--brand-red);
        }
        .error-state #sub-status {
            color: var(--brand-red);
            font-weight: 500;
        }

        @keyframes card-shake {
            10%, 90% { transform: translate3d(-1px, 0, 0) rotateX(var(--rotateX)) rotateY(var(--rotateY)); }
            20%, 80% { transform: translate3d(2px, 0, 0) rotateX(var(--rotateX)) rotateY(var(--rotateY)); }
            30%, 50%, 70% { transform: translate3d(-4px, 0, 0) rotateX(var(--rotateX)) rotateY(var(--rotateY)); }
            40%, 60% { transform: translate3d(4px, 0, 0) rotateX(var(--rotateX)) rotateY(var(--rotateY)); }
        }
        
        .footer {
            margin-top: 32px;
            font-size: 0.8rem;
            color: #64748b;
            opacity: 0;
            animation: card-fade-in 1s ease 0.8s forwards;
        }
        .footer code {
            background-color: rgba(0,0,0,0.2);
            color: var(--text-secondary);
            padding: 4px 8px;
            border-radius: 6px;
        }

        @media (max-width: 640px) {
            .card { padding: 40px 24px; }
            h1 { font-size: 1.75rem; }
        }
    </style>
</head>
<body>
    <canvas id="particle-canvas"></canvas>
    <div class="main-container">
        <div id="card" class="card">
            <div class="icon-container">
                <svg id="status-icon" class="secure-icon" viewBox="0 0 50 50">
                    <circle class="progress-track" cx="25" cy="25" r="22"/>
                    <circle id="progress-value" class="progress-value" cx="25" cy="25" r="22"/>
                    <!-- Icons will be dynamically inserted here by JS -->
                </svg>
            </div>
            <h1 id="main-status"></h1>
            <p id="sub-status"></p>
        </div>
        <div class="footer">
            <span>Ray ID: <code>${rayId}</code></span> &bull;
            <span>Your IP: <code>${clientIp}</code></span>
        </div>
    </div>

    <script>
        (async function() {
            // --- 1. Particle Background Logic ---
            const canvas = document.getElementById('particle-canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            let particlesArray;

            const mouse = { x: null, y: null, radius: 100 };
            window.addEventListener('mousemove', e => {
                mouse.x = e.x;
                mouse.y = e.y;
            });
            window.addEventListener('resize', () => {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                initParticles();
            });

            class Particle {
                constructor(x, y, dirX, dirY, size, color) {
                    this.x = x; this.y = y; this.dirX = dirX; this.dirY = dirY;
                    this.size = size; this.color = color;
                }
                draw() {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
                    ctx.fillStyle = 'rgba(0, 124, 240, 0.5)';
                    ctx.fill();
                }
                update() {
                    if (this.x > canvas.width || this.x < 0) this.dirX = -this.dirX;
                    if (this.y > canvas.height || this.y < 0) this.dirY = -this.dirY;
                    this.x += this.dirX;
                    this.y += this.dirY;
                    this.draw();
                }
            }

            function initParticles() {
                particlesArray = [];
                let numParticles = (canvas.height * canvas.width) / 9000;
                for (let i = 0; i < numParticles; i++) {
                    let size = (Math.random() * 2) + 1;
                    let x = (Math.random() * ((innerWidth - size * 2) - (size * 2)) + size * 2);
                    let y = (Math.random() * ((innerHeight - size * 2) - (size * 2)) + size * 2);
                    let dirX = (Math.random() * .4) - .2;
                    let dirY = (Math.random() * .4) - .2;
                    particlesArray.push(new Particle(x, y, dirX, dirY, size));
                }
            }

            function connectParticles() {
                for (let a = 0; a < particlesArray.length; a++) {
                    for (let b = a; b < particlesArray.length; b++) {
                        let distance = ((particlesArray[a].x - particlesArray[b].x) * (particlesArray[a].x - particlesArray[b].x)) +
                                     ((particlesArray[a].y - particlesArray[b].y) * (particlesArray[a].y - particlesArray[b].y));
                        if (distance < (canvas.width / 7) * (canvas.height / 7)) {
                            ctx.strokeStyle = 'rgba(0, 124, 240, 0.08)';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                            ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                            ctx.stroke();
                        }
                    }
                }
            }
            
            function animateParticles() {
                requestAnimationFrame(animateParticles);
                ctx.clearRect(0, 0, innerWidth, innerHeight);
                for (let i = 0; i < particlesArray.length; i++) {
                    particlesArray[i].update();
                }
                connectParticles();
            }

            initParticles();
            animateParticles();

            // --- 2. 3D Card Tilt Logic ---
            const card = document.getElementById('card');
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                const rotateX = -y / 30;
                const rotateY = x / 30;
                card.style.transform = \`rotateX(\${rotateX}deg) rotateY(\${rotateY}deg)\`;
                card.style.setProperty('--rotateX', \`\${rotateX}deg\`); // For shake animation
                card.style.setProperty('--rotateY', \`\${rotateY}deg\`);
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'rotateX(0deg) rotateY(0deg)';
            });


            // --- 3. Main Security Check Logic ---
            const mainStatus = document.getElementById('main-status');
            const subStatus = document.getElementById('sub-status');
            const progressCircle = document.getElementById('progress-value');
            const iconContainer = document.getElementById('status-icon');
            const radius = progressCircle.r.baseVal.value;
            const circumference = 2 * Math.PI * radius;
            progressCircle.style.strokeDasharray = circumference;
            progressCircle.style.strokeDashoffset = circumference;

            const sleep = ms => new Promise(res => setTimeout(res, ms));
            const typewriter = async (el, text, speed = 50) => {
                el.innerHTML = '';
                for (let i = 0; i < text.length; i++) {
                    await sleep(speed);
                    el.innerHTML += text.charAt(i);
                }
            };
            
            const scannerIcon = \`<path class="icon-symbol" d="M25 12 V 38 M12 25 H 38" stroke-dasharray="26" stroke-dashoffset="0" style="animation: spin 2s linear infinite; transform-origin: center;"/>\`;
            const checkmarkIcon = \`<path class="icon-symbol" d="M16 25 l6 6 l12 -12" />\`;
            const crossIcon = \`<path class="icon-symbol" d="M18 18 l14 14 M32 18 l-14 14" />\`;

            // SVG animation requires a style tag for keyframes
            document.head.insertAdjacentHTML("beforeend", \`<style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>\`);

            const steps = [
                { text: "Initializing Secure Channel", subSteps: ["Establishing handshake...", "Verifying certificates..."], duration: 1500 },
                { text: "Analyzing Connection", subSteps: ["Scanning TLS fingerprint...", "Validating JA3/JA4 hash..."], duration: 2000 },
                { text: "Behavioral Analysis", subSteps: ["Inspecting traffic patterns...", "Querying threat intelligence..."], duration: 2500 },
                { text: "Applying Firewall Rules", subSteps: ["Executing deep packet inspection...", "Cross-referencing WAF policies..."], duration: 2200 },
                { text: "Finalizing Security Scan", subSteps: ["Verifying client integrity...", "Compiling threat score..."], duration: 1800 }
            ];

            async function runCheckSequence() {
                iconContainer.innerHTML += scannerIcon;
                
                let totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
                let elapsedTime = 0;

                for (const step of steps) {
                    await typewriter(mainStatus, step.text, 30);
                    
                    for (const sub of step.subSteps) {
                        subStatus.textContent = sub;
                        await sleep(step.duration / step.subSteps.length);
                        elapsedTime += step.duration / step.subSteps.length;
                        
                        let progress = elapsedTime / totalDuration;
                        progressCircle.style.strokeDashoffset = circumference * (1 - progress);
                    }
                }
                
                await typewriter(mainStatus, "Verification Complete");
                subStatus.textContent = "";
                progressCircle.style.strokeDashoffset = 0;
                progressCircle.style.stroke = 'var(--brand-green)';
                
                // Switch to checkmark
                iconContainer.querySelector('.icon-symbol').classList.add('hidden');
                await sleep(300);
                iconContainer.innerHTML = iconContainer.innerHTML.replace(/<path.*?>/, '') + checkmarkIcon;
            }

            async function showFailureAndRedirect() {
                await sleep(800);
                card.classList.add('error-state');
                document.title = "Access Denied";
                
                await typewriter(mainStatus, "Threat Detected", 40);
                subStatus.textContent = "Your connection has been terminated.";
                
                // Switch to cross
                iconContainer.querySelector('.icon-symbol').classList.add('hidden');
                await sleep(300);
                iconContainer.innerHTML = iconContainer.innerHTML.replace(/<path.*?>/, '') + crossIcon;

                await sleep(3000);

                document.body.style.transition = 'opacity 1s ease-out';
                document.body.style.opacity = '0';
                
                await sleep(1000);
                window.location.href = 'https://www.cloudflare.com/learning/access-control/what-is-zero-trust/?utm_source=security_challenge_failed&ray_id=${rayId}';
            }

            await sleep(500);
            // This is a simulation, so we will show failure after the "successful" check animation
            await runCheckSequence();
            await showFailureAndRedirect();
        })();
    </script>
</body>
</html>
`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}