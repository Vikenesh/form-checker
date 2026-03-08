import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { ChallengeWorkspace } from './components/ChallengeWorkspace';
// Placeholders for future pages
const Dashboard = () => {
  const navigate = useNavigate();
  return (
    <div className="container animate-fade-in" style={{ paddingTop: '4rem', paddingBottom: '4rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '3rem', fontWeight: 700, marginBottom: '1rem' }}>
          Form & Flow
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.125rem', maxWidth: '600px', margin: '0 auto' }}>
          AI-powered athletic form checker. Upload your workout video and get real-time tracking,
          heuristic scoring, and pose estimation.
        </p>
      </header>
      
      <div className="flex-center" style={{ gap: '2rem', flexWrap: 'wrap' }}>
        <div className="glass" style={{ padding: '2rem', flex: '1 1 300px', maxWidth: '400px', textAlign: 'center' }}>
          <div className="flex-center" style={{ width: '4rem', height: '4rem', background: 'var(--surface-hover)', borderRadius: '50%', margin: '0 auto 1.5rem', color: 'var(--accent-primary)' }}>
            <Activity size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Tracker Challenge</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Run the 10-rep sequence challenge. We check your joints and track each stage perfectly to score up to 80 points.
          </p>
          <button className="btn-primary" style={{ width: '100%' }} onClick={() => navigate('/challenge')}>
            Start Challenge
          </button>
        </div>
      </div>
    </div>
  );
};

const ChallengePage = () => {
  return (
    <div className="container animate-fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <Activity color="var(--accent-primary)" size={24} />
          <span>Form & Flow</span>
        </Link>
      </header>
      
      <main style={{ flex: 1, paddingBottom: '2rem' }}>
        <ChallengeWorkspace />
      </main>
    </div>
  );
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/challenge" element={<ChallengePage />} />
    </Routes>
  );
}

export default App;
