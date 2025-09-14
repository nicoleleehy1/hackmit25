"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type ApiBatchResponse = unknown; // replace with your API type if desired
type ApiSingleResponse = unknown;

export default function FileUploads() {
  const [files, setFiles] = useState<File[]>([]);
  const [filter, setFilter] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  const onPickClick = () => inputRef.current?.click();

  const onFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const key = (f: File) => `${f.name}:${f.size}`;
      const seen = new Set(prev.map(key));
      const merged = [...prev];
      for (const f of arr) if (!seen.has(key(f))) merged.push(f);
      return merged;
    });
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(e.target.files);
    // allow re-selecting the same file(s)
    e.target.value = "";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === dropRef.current) setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, filter]);

  const removeFile = (name: string, size: number) => {
    setFiles((prev) => prev.filter((f) => !(f.name === name && f.size === size)));
  };

  const clearAll = () => setFiles([]);

  const queueForProcessing = async () => {
    if (files.length === 0) return;

    const useBatch = true; // set false for single-file mode

    try {
      if (useBatch) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f, f.name));

        const res = await fetch("/api/analyze/batch", { method: "POST", body: fd });
        if (!res.ok) {
          const text = await res.text();
          console.error("HTTP error", res.status, text);
          alert(`Upload failed (${res.status}). See console for details.`);
          return;
        }
        const data: ApiBatchResponse = await res.json();
        console.log("Batch results:", data);
      } else {
        const fd = new FormData();
        fd.append("file", files[0], files[0].name);

        const res = await fetch("/api/analyze", { method: "POST", body: fd });
        if (!res.ok) {
          const text = await res.text();
          console.error("HTTP error", res.status, text);
          alert(`Upload failed (${res.status}). See console for details.`);
          return;
        }
        const data: ApiSingleResponse = await res.json();
        console.log("Single-file result:", data);
      }
    } catch (err) {
      console.error("Network/CORS error:", err);
      alert("Network/CORS error. See console for details.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-800">Upload files</h1>
        <button
          type="button"
          onClick={clearAll}
          disabled={files.length === 0}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {/* Dropzone */}
      <div
        ref={dropRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onPickClick}
        className={[
          "mt-2 flex h-56 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition",
          isDragging ? "border-blue-400 bg-blue-50/50" : "border-gray-300 bg-white hover:bg-gray-50",
        ].join(" ")}
        aria-label="Drag and drop files here or click to select"
      >
        <div>
          <div className="text-sm font-semibold text-gray-800">Drag & drop files</div>
          <div className="mt-1 text-xs text-gray-500">or click to choose</div>
          <div className="mt-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPickClick();
              }}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              Choose files
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              onChange={onInputChange}
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="my-4 h-px w-full bg-gray-200" />
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Filter by name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
        <button
            type="button"
            onClick={async () => {
                if (files.length === 0) return;

                const fd = new FormData();
                // send all selected files; the route accepts both "file" and "files"
                files.forEach((f) => fd.append("files", f, f.name));

                try {
                const res = await fetch("/api/analyze", {
                    method: "POST",
                    body: fd,
                });

                if (!res.ok) {
                    const text = await res.text();
                    console.error("HTTP error", res.status, text);
                    alert(`Upload failed (${res.status}). See console for details.`);
                    return;
                }

                const data = await res.json();
                console.log("Layered results:", data);
                // data.results: { [filename]: { layer1, layer2, layer3 } }
                // data.merged : { layer1, layer2, layer3 }
                // TODO: set into state if you want to render it
                // setResult(data)
                } catch (err) {
                console.error("Network error:", err);
                alert("Network error. See console for details.");
                }
            }}
            disabled={files.length === 0}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
            Queue for Processing
            </button>
      </div>

      {/* File List */}
      <div className="mt-3 h-[45vh] overflow-y-auto rounded-xl border border-gray-200">
        {filtered.length === 0 ? (
          <div className="p-4 text-xs text-gray-500">No files added yet.</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filtered.map((f) => (
              <li
                key={`${f.name}:${f.size}`}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{f.name}</div>
                  <div className="truncate text-xs text-gray-500">
                    {(f.size / 1024).toFixed(1)} KB • {f.type || "unknown type"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(f.name, f.size)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
