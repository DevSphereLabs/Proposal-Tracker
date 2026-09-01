'use client';

import { useRef, useState } from 'react';
import { deleteFile, downloadFile, uploadFiles } from '@/lib/api';
import { usePortalTheme } from '@/lib/theme';
import type { ProposalFile } from '@/types';

// File table inside each proposal card. The client uploads documents with the
// Upload button; the checkboxes select rows to Download or Delete. Files are
// persisted by the backend. Any file can be downloaded, but a client may only
// delete files they uploaded themselves.
export default function FileManager({
  proposalId,
  initialFiles,
}: {
  proposalId: string;
  initialFiles: ProposalFile[];
}) {
  const theme = usePortalTheme();
  const [files, setFiles] = useState<ProposalFile[]>(initialFiles);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    setError('');
    setBusy(true);
    try {
      const added = await uploadFiles(proposalId, picked);
      setFiles((prev) => [...prev, ...added]);
    } catch {
      setError('Could not upload the selected file(s).');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    setError('');
    setBusy(true);
    try {
      const targets = files.filter((f) => selected.has(f.id));
      for (const file of targets) {
        await downloadFile(file.id, file.name);
      }
      setSelected(new Set());
    } catch {
      setError('Could not download the selected file(s).');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    // Only files the client uploaded can be deleted
    const deletable = files.filter((f) => selected.has(f.id) && f.uploadedByClient);
    if (deletable.length === 0) {
      setError('You can only delete files you uploaded.');
      return;
    }

    setError('');
    setBusy(true);
    try {
      const ids = new Set(deletable.map((f) => f.id));
      await Promise.all([...ids].map((id) => deleteFile(id)));
      setFiles((prev) => prev.filter((f) => !ids.has(f.id)));
      setSelected(new Set());
    } catch {
      setError('Could not delete the selected file(s).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-black text-lg">File Manager</h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`${theme.button} text-white font-semibold text-sm py-1.5 px-6 rounded-full disabled:opacity-50`}
        >
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* File table */}
      <div className="mt-3 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className={`${theme.tabActive} text-white text-left`}>
              <th className="font-bold px-4 py-2">File Name</th>
              <th className="font-bold px-4 py-2">Type</th>
              <th className="font-bold px-4 py-2">Size</th>
              <th className="font-bold px-4 py-2">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-gray-500 text-center">
                  No files uploaded yet.
                </td>
              </tr>
            ) : (
              files.map((file) => (
                <tr key={file.id} className="border-b border-gray-200 text-black">
                  <td className="px-4 py-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(file.id)}
                        onChange={() => toggleSelected(file.id)}
                      />
                      {file.name}
                    </label>
                  </td>
                  <td className="px-4 py-2">{file.type}</td>
                  <td className="px-4 py-2">{file.size}</td>
                  <td className="px-4 py-2">{file.uploaded}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

      {/* Act on the checked rows */}
      <div className="flex justify-end gap-3 mt-4">
        <button
          type="button"
          onClick={handleDownload}
          disabled={selected.size === 0 || busy}
          className={`${theme.button} text-white font-semibold text-sm py-1.5 px-6 rounded-full disabled:opacity-50`}
        >
          Download
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={selected.size === 0 || busy}
          className="bg-red-500 text-white font-semibold text-sm py-1.5 px-6 rounded-full disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
