import { useState, useRef, useEffect } from 'react';
import { VideoUploader } from './VideoUploader';
import { Activity, CheckCircle2, Zap } from 'lucide-react';
import { usePoseTracker } from '../hooks/usePoseTracker';
import { drawSkeleton } from '../utils/drawing';
import { evaluatePose, INITIAL_CONTEXT, PoseState, POSE_STATE_NAMES } from '../utils/rulesEngine';
import type { TrackingContext } from '../utils/rulesEngine';
import { publishRep, subscribeToReps } from '../utils/firebase';
import type { RepRecord } from '../utils/firebase';

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

  const sessionId = useRef<string>(
    localStorage.getItem('formCheckSessionId') || (() => {
      const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('formCheckSessionId', id);
      return id;
    })()
  ).current;

  const [liveReps, setLiveReps] = useState<RepRecord[]>([]);

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

  // Subscribe to live Firestore rep stream
  useEffect(() => {
    const unsubscribe = subscribeToReps(sessionId, setLiveReps);
    return () => unsubscribe();
  }, [sessionId]);

  if (!videoUrl) {
    return (
      <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', height: '100%' }}>
         <VideoUploader onVideoSelected={(url, name, ts) => { setVideoUrl(url); setPersonName(name); setUploadedAt(ts); }} />
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
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '1.125rem', fontWeight: 500 }}>
             Rep {context.reps} of 10
          </p>

          {/* Live Rep Timeline from Firestore */}
          {liveReps.length > 0 && (
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <h5 style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                <Zap size={14} /> Live Rep Feed
              </h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                {liveReps.map((rep, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Rep {rep.repNumber}</span>
                    <span style={{ color: 'var(--success)' }}>+{8} pts</span>
                    {rep.corrections.length > 0 && (
                      <span style={{ color: 'var(--error)', fontSize: '0.7rem' }}>⚠ {rep.corrections.length} correction{rep.corrections.length > 1 ? 's' : ''}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="glass" style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
          <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem', fontWeight: 600, color: 'white' }}>Current Sequence</h4>
          <p style={{ color: 'var(--accent-primary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            {context.message}
          </p>

          {context.recommendation && (
            <div className="animate-fade-in" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--error-glow)', border: '1px solid var(--error)', borderRadius: 'var(--radius-sm)', color: '#fee2e2', fontSize: '0.875rem' }}>
              <strong>Correction needed: </strong> {context.recommendation}
            </div>
          )}
          
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             {Object.entries(POSE_STATE_NAMES).map(([keyArg, name]) => {
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
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 600 }}>Rep-wise Form Validations & Corrections</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600, width: '40%' }}>Validation Rule / Correction</th>
                  {[...Array(10)].map((_, i) => (
                    <th key={i} style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>Rep {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Aggregate all unique rules that have ever been recommended across all reps */}
                {Array.from(new Set(context.repFeedback.flat())).length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No form corrections recorded yet. Complete a rep to see feedback!
                    </td>
                  </tr>
                ) : (
                  Array.from(new Set(context.repFeedback.flat())).map((rule, ruleIdx) => (
                    <tr key={ruleIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>{rule}</td>
                      {[...Array(10)].map((_, repIdx) => {
                        // Reps not yet started
                        if (repIdx > context.reps) return <td key={repIdx} style={{ padding: '1rem', textAlign: 'center', color: 'var(--border)' }}>-</td>;
                        
                        // Current rep in progress (or completed reps)
                        const feedbackForRep = repIdx < context.repFeedback.length ? context.repFeedback[repIdx] : Array.from(context.currentRepFailures);
                        const hasFailure = feedbackForRep.includes(rule);
                        
                        return (
                          <td key={repIdx} style={{ padding: '1rem', textAlign: 'center' }}>
                            {hasFailure ? (
                              <span style={{ color: 'var(--error)', fontWeight: 'bold' }}>✗</span>
                            ) : (
                              <span style={{ color: 'var(--success)' }}>✓</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
