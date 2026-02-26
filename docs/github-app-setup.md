# GitHub App Registration and Local Development Setup

## 1. What is a GitHub App?

A GitHub App is a first-class actor on GitHub with its own identity, dedicated webhook delivery, and granular permission controls. Unlike personal access tokens, a GitHub App is not tied to any individual user account, which makes it suitable for server-to-server integrations that need to survive team membership changes. GitHub Apps also receive significantly higher rate limits (15,000 requests per hour per installation) and allow you to subscribe only to the specific events your application requires.

---

## 2. Register the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.

2. Fill in the following settings:

   | Field | Value |
   |---|---|
   | App name | `GitHub Tracker Dev` (must be globally unique on GitHub) |
   | Homepage URL | `http://localhost:3000` |
   | Webhook URL | See [Local Development Setup](#5-local-development-setup-webhook-forwarding) below |
   | Webhook secret | Generate with `openssl rand -hex 32` and save the value |

3. Under **Repository permissions**, set:

   | Permission | Level |
   |---|---|
   | Pull requests | Read |
   | Contents | Read |
   | Metadata | Read (auto-selected) |

4. Under **Subscribe to events**, check:
   - Pull request
   - Pull request review
   - Push

   Note: `installation` and `installation_repositories` events are delivered automatically to all GitHub Apps — they are not listed in the event subscription UI.

5. Click **Create GitHub App**. On the resulting settings page, note down:
   - **App ID** (shown at the top of the page) — optional for now, will be needed for API calls in later epics
   - You can skip Client ID, Client Secret, and Private Key generation for now — they are not used by the webhook pipeline

---

## 3. Install the App

1. In the left sidebar of your app settings, click **Install App**.
2. Choose your organization or personal account.
3. Select **All repositories** or pick specific repositories you want to track.

After installation, GitHub will begin delivering webhook events to the URL you configured.

---

## 4. Configure Environment Variables

Add the following to the root `.env` file:

```
GITHUB_WEBHOOK_SECRET=<the webhook secret you generated>
```

This is the only variable required for the webhook pipeline. `GITHUB_WEBHOOK_SECRET` is validated as a required non-empty string in the config schema (`config.schema.ts`).

The `GITHUB_WEBHOOK_SECRET` is read by `WebhookSignatureGuard` to verify the HMAC-SHA256 signature on every incoming request. The server will reject any request that does not carry a valid `X-Hub-Signature-256` header.

---

## 5. Local Development Setup (Webhook Forwarding)

GitHub must be able to reach your local machine over the public internet. Because `localhost` is not reachable from GitHub's servers, you need a tunnel that forwards requests to your local API server.

The webhook endpoint is: `POST /api/v1/webhooks/github`

### Option A: smee.io (recommended for development)

smee.io is a free, purpose-built webhook proxy that requires no account.

1. Go to [https://smee.io](https://smee.io) and click **Start a new channel**.
2. Copy the proxy URL (e.g., `https://smee.io/abcdef123`).
3. Set this URL as the **Webhook URL** in your GitHub App settings.
4. Install the smee client globally:
   ```bash
   npm install -g smee-client
   ```
5. Start forwarding:
   ```bash
   smee -u https://smee.io/abcdef123 --target http://localhost:3000/api/v1/webhooks/github
   ```

Keep this process running alongside the API server during development. Webhook deliveries appear in the smee.io channel page and are replayed automatically on reconnect.

### Option B: ngrok

1. Install ngrok:
   ```bash
   brew install ngrok  # macOS
   ```
2. Start a tunnel:
   ```bash
   ngrok http 3000
   ```
3. Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok.io`) and set the **Webhook URL** in your GitHub App settings to:
   ```
   https://abc123.ngrok.io/api/v1/webhooks/github
   ```

Note: ngrok URLs change on every restart unless you have a paid account with a reserved domain.

---

## 6. Testing Without a Real GitHub App

The test suite does not require a real GitHub App. Unit and integration tests override `WebhookSignatureGuard` with a permissive stub (`AllowAllGuard`) and use Jest to mock the HTTP layer, so no real credentials or network access are needed.

To manually verify the webhook endpoint against a locally running server, generate a signed payload with `openssl` and send it with `curl`:

```bash
# Generate a test payload
BODY='{"action":"created","installation":{"id":1,"account":{"id":1,"login":"test","avatar_url":""}}}'
SECRET="your_webhook_secret"
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# Send to local endpoint
curl -X POST http://localhost:3000/api/v1/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: installation" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$BODY"
```

A `200 OK` response with an empty body confirms that the signature was accepted and the event was routed successfully.

---

## 7. Webhook Event Flow

The following describes the path a webhook request takes from GitHub to the database:

```
GitHub
  └── POST /api/v1/webhooks/github
        └── WebhookSignatureGuard
              Verifies X-Hub-Signature-256 using HMAC-SHA256 and GITHUB_WEBHOOK_SECRET.
              Rejects with 401 if the signature is missing or does not match.
              └── WebhooksController.handleWebhook(event, payload)
                    Reads X-GitHub-Event header and raw body.
                    └── WebhooksService.route(event, payload)
                          Dispatches to the appropriate handler based on event type.
                          ├── installation / installation_repositories
                          │     └── InstallationHandler
                          │           Upserts Organization and Repository records.
                          ├── pull_request
                          │     └── PullRequestHandler
                          │           Upserts PullRequest record.
                          ├── pull_request_review
                          │     └── PullRequestReviewHandler
                          │           Upserts PullRequestReview record.
                          └── push
                                └── PushHandler
                                      Upserts Commit records.
```

Unrecognized event types are logged and silently ignored — no error is returned to GitHub.
