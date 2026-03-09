import { useState, useRef, useEffect } from 'react';
import { VideoUploader } from './VideoUploader';
import { Activity, CheckCircle2 } from 'lucide-react';
import { usePoseTracker } from '../hooks/usePoseTracker';
import { drawSkeleton } from '../utils/drawing';
import { evaluatePose, INITIAL_CONTEXT, PoseState, POSE_STATE_NAMES } from '../utils/rulesEngine';
import type { TrackingContext, RepStatus } from '../utils/rulesEngine';
import { publishRep } from '../utils/firebase';


export const ChallengeWorkspace = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [personName, setPersonName] = useState('');
  const [uploadedAt, setUploadedAt] = useState('');
  const { isLoaded, detectFrame } = usePoseTracker();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  const [context, setContext] = useState<TrackingContext>(INITIAL_CONTEXT);
  const prevRepsRef = useRef<number>(0);
  const prevContextRef = useRef<TrackingContext>(INITIAL_CONTEXT);

  // Session-based state
  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = localStorage.getItem('formCheckSessionId');
    if (saved) return saved;
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem('formCheckSessionId', id);
    return id;
  });

  const resetSession = () => {
    const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem('formCheckSessionId', newId);
    setSessionId(newId);
    setContext(INITIAL_CONTEXT);
    prevRepsRef.current = 0;
    prevContextRef.current = INITIAL_CONTEXT;
  };

  const processVideoOptions = () => {
    if (!videoRef.current || !canvasRef.current || !isLoaded) return;
    const video = videoRef.current;
    
    // Only process if video is currently playing and has dimensions
    if (video.paused || video.ended || video.videoWidth === 0) {
      requestRef.current = requestAnimationFrame(processVideoOptions);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video dimensions for overlay mapping
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }

    const timestampMs = performance.now();
    const result = detectFrame(video, timestampMs);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result && result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      drawSkeleton(ctx, landmarks, canvas.width, canvas.height);
      
      // We process state transitions every frame using heuristic engine
      setContext(prev => {
        const next = evaluatePose(landmarks, prev, video.currentTime * 1000);
        
        // Detect when a rep just completed (reps incremented)
        if (next.reps > prevRepsRef.current) {
          const repIndex = next.reps - 1;
          const corrections = next.repFeedback[repIndex] || [];
          publishRep({
            repNumber: next.reps,
            score: next.score,
            corrections,
            sessionId,
            personName,
            uploadedAt,
          });
          prevRepsRef.current = next.reps;
        }
        prevContextRef.current = next;
        return next;
      });
    }

    requestRef.current = requestAnimationFrame(processVideoOptions);
  };

  useEffect(() => {
    if (isLoaded && videoUrl) {
      requestRef.current = requestAnimationFrame(processVideoOptions);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isLoaded, videoUrl, detectFrame]);



  if (!videoUrl) {
    return (
      <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', height: '100%' }}>
         <VideoUploader onVideoSelected={(url, name, ts) => { 
           resetSession();
           setVideoUrl(url); 
           setPersonName(name); 
           setUploadedAt(ts); 
         }} />
      </div>
    );
  }

  return (
    <div className="layout-grid animate-fade-in" style={{ height: 'calc(100vh - 100px)', gap: '1.5rem' }}>
      <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
        {!isLoaded && (
          <div className="glass flex-center" style={{ padding: '1rem', color: 'var(--warning)', gap: '0.5rem' }}>
             Loading AI Model...
          </div>
        )}
        <div className="glass" style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '0.5rem', display: 'flex', flexDirection: 'column' }}>
          <video 
            ref={videoRef}
            src={videoUrl} 
            controls 
            autoPlay
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'contain', 
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)'
            }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              objectFit: 'contain'
            }}
          />
        </div>
      </div>
      
      <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
        <div className="glass" style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600 }}>
             <Activity className="gradient-text" /> Live Scoreboard
          </h3>
          {personName && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              👤 {personName}
              {uploadedAt && <span style={{ opacity: 0.6, marginLeft: '0.5rem' }}>· {new Date(uploadedAt).toLocaleString()}</span>}
            </p>
          )}
          <div style={{ fontSize: '5rem', fontWeight: 700, lineHeight: 1, textAlign: 'center', marginBottom: '1rem', textShadow: '0 0 40px var(--accent-glow)' }} className="gradient-text">
            {context.score} <span style={{ fontSize: '2rem', color: 'var(--text-secondary)' }}>/ 80</span>
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '1.125rem', fontWeight: 500, marginBottom: '1.5rem' }}>
             Rep {context.reps} of 10
          </p>

          <button 
            className="btn-secondary" 
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}
            onClick={() => setVideoUrl(null)}
          >
            Upload New Video
          </button>


        </div>
        
        <div className="glass" style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
          <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Current Sequence</h4>
          <p style={{ color: 'var(--accent-primary)', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>
            {context.message}
          </p>

          {context.recommendation && (
            <div className="animate-fade-in" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--error-glow)', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', color: '#fee2e2', fontSize: '0.875rem' }}>
              <strong>Correction needed: </strong> {context.recommendation}
            </div>
          )}
          
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.entries(POSE_STATE_NAMES)
                .sort((a,b) => Number(a[0]) - Number(b[0]))
                .map(([keyArg, name]) => {
                const stepKey = Number(keyArg);
                const isActive = stepKey === context.currentState;
                const isCompleted = stepKey < context.currentState || (context.reps > 0 && context.currentState === PoseState.STANDING_START && stepKey !== PoseState.STANDING_START);

                let iconNode;
                if (isCompleted) {
                  iconNode = <CheckCircle2 color="var(--success)" size={24} style={{ filter: 'drop-shadow(0 0 8px var(--success-glow))' }} />;
                } else if (isActive) {
                  iconNode = <div className="animate-pulse" style={{ width: '24px', height: '24px', borderRadius: '50%', border: '4px solid var(--accent-primary)', background: 'var(--bg-primary)' }}></div>;
                } else {
                  iconNode = <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid var(--border)' }}></div>;
                }

                return (
                  <li key={stepKey} style={{ 
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', 
                    borderRadius: 'var(--radius-sm)', 
                    background: isActive ? 'var(--surface-hover)' : 'transparent',
                    border: isActive ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    boxShadow: isActive ? '0 0 12px var(--accent-glow)' : 'none',
                    transition: 'all var(--transition-normal)'
                  }}>
                    {iconNode}
                    <span style={{ 
                      color: isCompleted ? 'var(--text-primary)' : isActive ? 'var(--accent-primary)' : 'var(--text-secondary)', 
                      fontWeight: isActive ? 600 : 500 
                    }}>{name}</span>
                  </li>
                );
             })}
          </ul>
          
          <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.875rem' }}>
            <h5 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Debug Heuristics</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {Object.entries(context.debugInfo || {}).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: val ? 'var(--success)' : 'var(--error)' }} />
                  <span style={{ color: val ? 'white' : 'var(--text-secondary)' }}>{key}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
         {/* Rep-wise Form Correction Table */}
      <div style={{ gridColumn: 'span 12', paddingBottom: '2rem' }}>
        <div className="glass" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', fontWeight: 600 }}>Rep-wise Form Validations &amp; Corrections</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
                🟢 Valid rep = 8 pts &nbsp;|&nbsp; 🔴 Invalid rep = 0 pts (disqualified) &nbsp;|&nbsp; ⚠ Form correction logged
              </p>
            </div>
            <button 
              className="btn-secondary" 
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              onClick={() => {
                resetSession();
                setVideoUrl(null);
              }}
            >
              Clear &amp; New Upload
            </button>
          </div>
          {context.repStatus.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No reps completed yet. Finish a rep to see feedback!</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Rep</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Time</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Points</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Disqualifying Reasons</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Form Corrections</th>
                  </tr>
                </thead>
                <tbody>
                  {context.repStatus.map((rep: RepStatus) => (
                    <tr 
                      key={rep.repNumber}
                      style={{ 
                        borderBottom: '1px solid var(--border)',
                        background: rep.valid ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.05)'
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Rep {rep.repNumber}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{rep.completionTime}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {rep.valid
                          ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✅ Valid</span>
                          : <span style={{ color: 'var(--error)', fontWeight: 700 }}>❌ Invalid</span>
                        }
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: rep.valid ? 'var(--success)' : 'var(--error)' }}>
                        {rep.valid ? '+8 pts' : '0 pts'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {rep.disqualifyingReasons.length === 0 ? (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>None</span>
                        ) : (
                          <ul style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.78rem', color: 'var(--error)' }}>
                            {rep.disqualifyingReasons.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {rep.formCorrections.length === 0 ? (
                          <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>✓ Clean form</span>
                        ) : (
                          <ul style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.78rem', color: 'var(--warning)' }}>
                            {rep.formCorrections.map((c, i) => <li key={i}>⚠ {c}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
