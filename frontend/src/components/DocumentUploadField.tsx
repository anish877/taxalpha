import { useRef, useState } from 'react';

import {
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT_ATTR,
  getDocumentViewUrl,
  isAcceptedUploadType,
  uploadDocument
} from '../api/uploads';

interface DocumentValue {
  documentKey: string | null;
  documentFileName: string | null;
}

interface DocumentUploadFieldProps extends DocumentValue {
  /** Namespacing label for the stored object, e.g. a question id. */
  scope: string;
  onChange: (next: DocumentValue) => void;
  disabled?: boolean;
}

/**
 * Optional document upload for a form field. Picks a file, uploads it straight
 * to S3 via a backend presigned URL, and reports back the stored key + file
 * name. Viewing fetches a fresh short-lived signed URL on demand.
 */
export function DocumentUploadField({
  scope,
  documentKey,
  documentFileName,
  onChange,
  disabled = false
}: DocumentUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    if (!isAcceptedUploadType(file.type)) {
      setError('Unsupported file type. Upload a JPG, PNG, WEBP, HEIC, or PDF.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('File is too large. Maximum size is 15 MB.');
      return;
    }

    setUploading(true);
    try {
      onChange(await uploadDocument(file, scope));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const openDocument = async () => {
    if (!documentKey) return;
    setError(null);
    setOpening(true);
    try {
      const url = await getDocumentViewUrl(documentKey);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Could not open the document. Please try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <p className="text-xs text-mute">Upload document (optional)</p>

      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT_ATTR}
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {documentKey ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span
            className="max-w-full truncate rounded-lg bg-paper px-2 py-1 text-sm"
            title={documentFileName ?? undefined}
          >
            📎 {documentFileName ?? 'Uploaded document'}
          </span>
          <button
            type="button"
            className="text-sm font-medium text-accent underline disabled:opacity-50"
            onClick={() => void openDocument()}
            disabled={opening}
          >
            {opening ? 'Opening…' : 'View'}
          </button>
          <button
            type="button"
            className="text-sm text-mute underline disabled:opacity-50"
            onClick={pickFile}
            disabled={uploading || disabled}
          >
            {uploading ? 'Uploading…' : 'Replace'}
          </button>
          <button
            type="button"
            className="text-sm text-red-600 underline disabled:opacity-50"
            onClick={() => {
              setError(null);
              onChange({ documentKey: null, documentFileName: null });
            }}
            disabled={uploading}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-medium transition hover:border-accent disabled:opacity-50"
            onClick={pickFile}
            disabled={uploading || disabled}
          >
            {uploading ? 'Uploading…' : 'Choose file'}
          </button>
          <span className="text-xs text-mute">JPG, PNG, WEBP, HEIC, or PDF · up to 15 MB</span>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
