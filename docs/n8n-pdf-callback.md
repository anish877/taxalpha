# n8n → TaxAlpha: PDF callback contract

When a client completes a form, the TaxAlpha backend sends the form data to your
n8n webhook. After n8n generates the PDF, **n8n must call back into the TaxAlpha
backend with the PDF URL** so the broker’s frontend can show/track it.

This doc is the contract for that callback.

```
 Frontend ──submit──▶ Backend ──webhook──▶ n8n ──generate PDF──┐
                          ▲                                     │
                          └──────── POST pdfUrl (callback) ◀────┘
                          │
                  Frontend polls backend ──▶ shows the PDF
```

---

## 1. What n8n receives (the outbound webhook payload)

Every form webhook body looks like this:

```jsonc
{
  "metadata": {
    "clientId": "clbtx…",
    "clientName": "Jane Doe",
    "clientEmail": "jane@example.com",
    "clientPhone": "+1…",
    "formCode": "BAIODF",
    "formTitle": "Brokerage Alternative Investment Order and Disclosure Form",
    "callbackUrl": "https://api.taxalpha.example/api/n8n/clients/clbtx…/forms/BAIODF/pdfs",
    "callbackSecret": "the-shared-secret",
    "workspaceFormCode": "BAIODF",
    "onboardingStatus": "COMPLETED"
  },
  "fields": { /* the form’s answers */ }
}
```

> **You do not need to build the URL or know the secret out‑of‑band.** The payload
> gives you both:
> - `metadata.callbackUrl` — POST the PDF here (already encodes `clientId` + `formCode`)
> - `metadata.callbackSecret` — send this in the `x-taxalpha-callback-secret` header
>
> In the HTTP Request node, set the header **Value** to the expression
> `{{ $json.metadata.callbackSecret }}` (not a literal like `$N8N_CALLBACK_SECRET`).

---

## 2. The callback request (n8n → backend)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{ $json.metadata.callbackUrl }}` — i.e. `https://<BACKEND_PUBLIC_URL>/api/n8n/clients/<clientId>/forms/<formCode>/pdfs` |
| **Header** | `x-taxalpha-callback-secret: {{ $json.metadata.callbackSecret }}` (the backend validates it against its `N8N_CALLBACK_SECRET`) |
| **Header** | `Content-Type: application/json` |

### Body

| Field | Type | Required | Notes |
|---|---|:--:|---|
| `pdfUrl` | string (URL) | ✅ | Public/streamable URL of the generated PDF. Must be a valid URL. |
| `sourceRunId` | string | ▶ recommended | The n8n execution id. Used for idempotency — strongly recommended. |
| `documentTitle` | string | optional | Display title; defaults to the form’s title if omitted. |
| `fileName` | string | optional | Original/suggested file name. |
| `generatedAt` | string (ISO‑8601) | optional | When the PDF was generated, e.g. `2026-06-17T16:40:00Z`. |

### Example

```bash
curl -X POST "https://api.taxalpha.example/api/n8n/clients/clbtx123/forms/BAIODF/pdfs" \
  -H "Content-Type: application/json" \
  -H "x-taxalpha-callback-secret: $N8N_CALLBACK_SECRET" \
  -d '{
    "pdfUrl": "https://files.example.com/taxalpha/baiodf-clbtx123.pdf",
    "sourceRunId": "{{ $execution.id }}",
    "documentTitle": "Brokerage Alternative Investment Order and Disclosure Form",
    "fileName": "BAIODF-JaneDoe.pdf",
    "generatedAt": "2026-06-17T16:40:00Z"
  }'
```

---

## 3. Responses

| Status | Meaning | Body |
|---|---|---|
| `201 Created` | PDF recorded | `{ "message": "PDF recorded.", "pdfId": "…" }` |
| `200 OK` | Already recorded (idempotent re‑send) | `{ "message": "PDF already recorded.", "pdfId": "…" }` |
| `400 Bad Request` | Missing/invalid `pdfUrl`, or unsupported `formCode` | `{ "message": "Invalid PDF callback payload." }` |
| `401 Unauthorized` | Missing/wrong `x-taxalpha-callback-secret` | `{ "message": "Invalid callback secret." }` |
| `404 Not Found` | Unknown client, or form not selected for that client | `{ "message": "Client not found." }` |

Treat `200` and `201` as success.

---

## 4. Idempotency (safe retries)

The backend de‑duplicates so retries never create duplicates:

- If you send `sourceRunId`, dedupe is by **(clientId, formCode, sourceRunId)**.
- Otherwise dedupe is by **(clientId, formCode, pdfUrl)** (also a DB unique constraint).

➡️ **Always send `sourceRunId`** (the n8n execution id). Then re‑running a node or
retrying on error is harmless.

---

## 5. Supported form codes

Echo back the **same `metadata.formCode`** you received. Valid values:

`INVESTOR_PROFILE` · `INVESTOR_PROFILE_ADDITIONAL_HOLDER` · `SFC` · `BAIODF` · `BAIV_506C`

(`metadata.callbackUrl` already contains the right one — just use it.)

---

## 6. How the frontend tracks it

Once the callback is stored, the broker UI picks the PDF up automatically by polling:

- `GET /api/clients/pdfs/updates` — newly received PDFs across the broker’s clients
- `GET /api/clients/:clientId/forms/:formCode/pdfs` — PDFs for one form

Each record exposes `pdfUrl`, `documentTitle`, `fileName`, `sourceRunId`,
`generatedAt`, and `receivedAt`. So the moment your callback returns `201`, the
PDF becomes visible to the broker — no further action needed from n8n.

---

## 7. Local testing note

In production, `metadata.callbackUrl` uses the backend’s `BACKEND_PUBLIC_URL`. When
the backend runs on `localhost`, n8n (remote) **cannot** reach it, so the callback
will fail even though the outbound webhook fires. To test the full round‑trip
locally, expose the backend with a tunnel (e.g. `ngrok http 4000`) and set
`BACKEND_PUBLIC_URL` to the tunnel URL before submitting a form.
