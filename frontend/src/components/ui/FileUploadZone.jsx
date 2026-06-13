import { useRef, useState } from 'react';
import { Upload, FileCheck } from 'lucide-react';

function truncate(name, max = 20) {
  if (!name) return '';
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, max - ext.length - 1);
  return `${base}…${ext}`;
}

export default function FileUploadZone({
  id,
  name,
  title,
  required = false,
  optional = false,
  accept = '.jpg,.jpeg,.png,.pdf',
  onFileChange,
}) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file) {
    if (!file || !inputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    inputRef.current.files = dt.files;
    setFileName(file.name);
    onFileChange?.(file);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-text-secondary uppercase tracking-wider">{title}</span>
        {optional && (
          <span className="bg-bg-tertiary text-text-secondary text-xs px-2 py-1 rounded-md">
            Optional
          </span>
        )}
        {required && !optional && (
          <span className="text-loss text-xs">*</span>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          handleFile(file);
        }}
        className={`upload-zone border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-2 text-center min-h-[120px] bg-bg-secondary dark:bg-transparent ${
          fileName
            ? 'border-profit bg-profit/5'
            : dragOver
              ? 'border-accent bg-accent/10'
              : 'border-border hover:border-accent hover:bg-accent/5'
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          className="hidden"
          accept={accept}
          required={required && !optional}
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileName(file?.name || '');
            onFileChange?.(file);
          }}
        />

        {fileName ? (
          <>
            <FileCheck className="w-6 h-6 text-profit" strokeWidth={1.75} />
            <p className="text-sm text-text-primary font-medium">{truncate(fileName)}</p>
            <button
              type="button"
              className="text-xs text-accent hover:text-accent-hover"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Change file
            </button>
          </>
        ) : (
          <>
            <Upload className="w-6 h-6 text-text-secondary" strokeWidth={1.75} />
            <p className="text-sm text-text-secondary">Upload {title}</p>
            <p className="text-xs text-text-muted">Click to browse or drag &amp; drop</p>
            <span className="bg-bg-tertiary text-text-secondary text-xs px-2 py-1 rounded-md">
              JPG, PNG, PDF — Max 5MB
            </span>
          </>
        )}
      </div>
    </div>
  );
}
