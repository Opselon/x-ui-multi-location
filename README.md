# x-ui multi-location Cloudflare Worker

This Worker proxies subscription requests to several upstream nodes, merges the responses, and can notify a Telegram channel whenever a user successfully fetches their subscription. Deploy it to Cloudflare Workers and point your subscription clients at the Worker URL instead of the individual upstream nodes.

## Features

- Multi-target subscription fetch with per-target caching and retry/backoff logic.
- Automatic extraction of subscription remarks for richer Telegram notifications.
- Built-in cache coalescing and size limits to keep responses fast and safe.
- Optional DPI-style fallback page if no upstream returns data.
- Optional fallback subscription bundle: if every upstream is offline, the Worker responds with the `EXTRA_SUB_CONFIGS` presets instead of failing the request.
- Smart path prefix rewriting keeps placeholder routes (e.g. `jsonreadytocatchupdatefast`) in the returned configs aligned with your active `pathPrefix`.

## 1. Configure the Worker

All runtime settings live at the top of [`multi.js`](multi.js).

### Telegram notifications

```js
const SETTINGS = {
  TELEGRAM: {
    enabled: true,
    botToken: 'your-telegram-bot-token',
    chatId: '@your_channel_or_chat_id',
    parseMode: 'HTML',
  },
  // ...
};
```

- Set `botToken` to the API token from BotFather.
- Set `chatId` to the channel/group/user ID that should receive notifications.
- Toggle `enabled` to `false` if you do not want to send notifications.

### Subscription targets

Each subscription endpoint you want to aggregate must be listed in the `TARGETS` array. Every entry needs the upstream host, port, and the path prefix that contains the subscription ID.

```js
const TARGETS = [
  { host: 'example.com', port: '443', pathPrefix: '/path/to/sub/' },
  { host: 'another.example.com', port: '2096', pathPrefix: '/custom-prefix/' },
];
```

When a request arrives, the Worker extracts the subscription ID from the incoming path/query. The ID is appended after `pathPrefix` to build the final upstream URL:

```
https://{host}:{port}{pathPrefix}{subscriptionId}
```

> **Tip:** The prefix must include the trailing slash (`/`). If the upstream expects `/sub/123`, set the prefix to `/sub/`.

#### Smart prefix replacement

If your upstream subscription payloads contain the placeholder string `jsonreadytocatchupdatefast` (with or without surrounding slashes), the Worker automatically replaces it with the first target's `pathPrefix`. This keeps the generated subscription URLs consistent even when you customize the prefix on the Worker side.

## 2. Deploy with Wrangler

1. Install Wrangler and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. Create or update your Worker project and upload `multi.js`:
   ```bash
   wrangler init x-ui-multi-location
   # Replace the generated worker with multi.js
   cp multi.js ./src/index.js
   ```
3. Publish the Worker:
   ```bash
   wrangler deploy
   ```

## 3. Point subscription clients to the Worker

Update your subscription URLs so that the client fetches from the Worker instead of a direct node. The Worker URL typically looks like:

```
https://your-worker.your-subdomain.workers.dev/<subscription-id>
```

If you are fronting the Worker with your own domain via Cloudflare Routes, use that domain instead, e.g.:

```
https://proxy.example.com/api/<subscription-id>
```

As long as the path (or query parameter) contains a valid subscription ID, the Worker will forward the request to each configured upstream target, merge the responses, and (if enabled) send a notification to Telegram with the extracted remark.

## 4. Optional settings

- `DEBUG_SECRET`: Set a unique value to enable verbose debug output by calling the Worker with `?debug=<secret>`.
- `ENCODING`: Change the default encoding or expose a different query parameter for clients that request `hex` output.
- `FETCH_TIMEOUT`, `MAX_CONTENT_LENGTH`: Adjust to match the performance and limits of your upstream nodes.

## Troubleshooting

- **Empty response (HTTP 204):** The Worker contacted an upstream node but received no usable content.
- **Fallback extras served:** When every upstream fetch fails, the Worker returns only the values listed in `EXTRA_SUB_CONFIGS` and sends a failure notification (if Telegram is enabled). Update the upstream hosts or investigate outages, but clients still receive a valid response.
- **DPI page:** No upstream accepted the provided ID. Double-check the ID, the `TARGETS` configuration, and that the upstream server is reachable from Cloudflare.
- **Telegram notification missing:** Ensure the bot token and chat ID are correct and that the bot has permission to post in the channel/group.

Once deployed and configured, push the Worker code to your Git repository so you can keep track of future adjustments to target hosts, prefixes, and notification behavior.

## 5. Push to GitHub (main branch)

To publish the Worker source to GitHub on the `main` branch:

1. Ensure your local branch is named `main`:
   ```bash
   git branch -m main
   ```
2. Add your GitHub repository as the remote:
   ```bash
   git remote add origin https://github.com/<your-account>/<your-repo>.git
   ```
3. Push the code to the `main` branch:
   ```bash
   git push -u origin main
   ```

If the remote already exists, replace step 2 with `git remote set-url origin <new-url>`.
