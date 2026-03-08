import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

interface Props {
  onVideoSelected: (url: string) => void;
}

export const VideoUploader: React.FC<Props> = ({ onVideoSelected }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
         onVideoSelected(URL.createObjectURL(file));
      } else {
         alert('Please upload a valid video file.');
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
       onVideoSelected(URL.createObjectURL(e.target.files[0]));
    }
  };

  return (
    <div 
      className={`glass animate-fade-in ${isDragging ? 'drag-active' : ''}`}
      style={{ 
        width: '100%', maxWidth: '600px', margin: '0 auto', padding: '4rem 2rem', 
        textAlign: 'center', cursor: 'pointer', borderStyle: 'dashed',
        borderColor: isDragging ? 'var(--accent-primary)' : 'var(--border)',
        transition: 'all var(--transition-normal)'
      }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input 
        type="file" 
        accept="video/*" 
        style={{ display: 'none' }} 
        ref={inputRef}
        onChange={handleChange}
      />
      <div style={{ color: 'var(--accent-primary)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
         <UploadCloud size={64} style={{ filter: 'drop-shadow(0 0 12px var(--accent-glow))' }} />
      </div>
      <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>Upload your workout video</h3>
      <p style={{ color: 'var(--text-secondary)' }}>Drag and drop or click to browse</p>
    </div>
  );
}
