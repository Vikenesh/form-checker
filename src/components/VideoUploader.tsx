import React, { useRef, useState } from 'react';
import { UploadCloud, User, ArrowRight } from 'lucide-react';

interface Props {
  onVideoSelected: (url: string, personName: string, uploadedAt: string) => void;
}

export const VideoUploader: React.FC<Props> = ({ onVideoSelected }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [personName, setPersonName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [nameError, setNameError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim()) {
      setNameError('Please enter your name to continue.');
      return;
    }
    setNameError('');
    setNameSubmitted(true);
  };

  const processFile = (file: File) => {
    if (file.type.startsWith('video/')) {
      const uploadedAt = new Date().toISOString();
      onVideoSelected(URL.createObjectURL(file), personName.trim(), uploadedAt);
    } else {
      alert('Please upload a valid video file.');
    }
  };

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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Step 1: Name entry
  if (!nameSubmitted) {
    return (
      <div className="glass animate-fade-in" style={{ width: '100%', maxWidth: '480px', margin: '0 auto', padding: '4rem 2.5rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--accent-primary)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <User size={64} style={{ filter: 'drop-shadow(0 0 12px var(--accent-glow))' }} />
        </div>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>Who's performing the challenge?</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Your name will be saved with your scores so you can track improvement over time.
        </p>
        <form onSubmit={handleNameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            type="text"
            placeholder="Enter your full name"
            value={personName}
            autoFocus
            onChange={(e) => setPersonName(e.target.value)}
            style={{
              background: 'var(--bg-primary)',
              border: `1px solid ${nameError ? 'var(--error)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '0.875rem 1.25rem',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          {nameError && (
            <p style={{ color: 'var(--error)', fontSize: '0.825rem', textAlign: 'left', margin: '-0.5rem 0 0' }}>{nameError}</p>
          )}
          <button
            type="submit"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: 'var(--accent-primary)', color: 'white', border: 'none',
              padding: '0.875rem 1.5rem', borderRadius: 'var(--radius-sm)',
              fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
              transition: 'opacity var(--transition-normal)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Continue <ArrowRight size={18} />
          </button>
        </form>
      </div>
    );
  }

  // Step 2: Video upload
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
      <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>
        Hey <span className="gradient-text">{personName}</span>, upload your video!
      </h3>
      <p style={{ color: 'var(--text-secondary)' }}>Drag and drop or click to browse</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.6 }}>
        Uploaded at: {new Date().toLocaleString()}
      </p>
    </div>
  );
};
