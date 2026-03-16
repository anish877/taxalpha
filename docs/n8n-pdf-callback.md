# n8n PDF Callback Setup

## Backend env

Add these values in `backend/.env`:

```env
BACKEND_PUBLIC_URL=https://your-backend-domain.com
N8N_CALLBACK_SECRET=replace_with_a_shared_secret
```

Already required and still used:

```env
N8N_INVESTOR_PROFILE_WEBHOOK_URL=https://your-n8n/webhook/investor-profile
N8N_INVESTOR_PROFILE_ADDITIONAL_HOLDER_WEBHOOK_URL=https://your-n8n/webhook/additional-holder
N8N_STATEMENT_OF_FINANCIAL_CONDITION_WEBHOOK_URL=https://your-n8n/webhook/sfc
N8N_BAIODF_WEBHOOK_URL=https://your-n8n/webhook/baiodf
N8N_BAIV_506C_WEBHOOK_URL=https://your-n8n/webhook/baiv-506c
```

## What TaxAlpha sends to n8n

Each webhook payload now includes:

```json
{
  "metadata": {
    "clientId": "client_123",
    "formCode": "SFC",
    "formTitle": "Statement of Financial Condition",
    "workspaceFormCode": "SFC",
    "callbackUrl": "https://your-backend-domain.com/api/n8n/clients/client_123/forms/SFC/pdfs"
  },
  "fields": {}
}
```

## What n8n must do

After generating or uploading the PDF, n8n should make an HTTP `POST` to `metadata.callbackUrl`.

Headers:

```http
x-taxalpha-callback-secret: replace_with_a_shared_secret
Content-Type: application/json
```

Body:

```json
{
  "pdfUrl": "https://your-file-host/path/file.pdf",
  "documentTitle": "Statement of Financial Condition",
  "fileName": "statement-of-financial-condition.pdf",
  "sourceRunId": "optional-stable-run-id",
  "generatedAt": "2026-03-16T10:00:00.000Z"
}
```

## n8n editor notes

- Use the incoming webhook payload field `metadata.callbackUrl` as the callback URL.
- Use the same shared secret as `N8N_CALLBACK_SECRET` in the callback request header.
- `pdfUrl` is required.
- `sourceRunId` is recommended so duplicate callbacks are ignored safely.
- For Investor Profile additional-holder PDFs, TaxAlpha automatically files them under the Investor Profile workspace card.

## Example n8n expression values

Callback URL:

```text
{{ $json.metadata.callbackUrl }}
```

Secret header:

```text
{{ $env.N8N_CALLBACK_SECRET }}
```

PDF URL:

```text
{{ $json.pdfUrl }}
```
