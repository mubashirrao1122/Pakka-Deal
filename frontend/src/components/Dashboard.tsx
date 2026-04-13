import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import './Dashboard.css';

interface AITemplateResult {
  dealType: string;
  title: string;
  milestones: { label: string; percent: number }[];
  gracePeriodHours: number;
  suggestedCollateralPct: number;
  detectedLanguage: string;
}

interface DashboardProps {
  pakkaScore?: number;
  nullifier?: string | null;
}

export default function Dashboard({ pakkaScore = 100, nullifier }: DashboardProps) {
  const { getAccessToken, user, logout } = usePrivy();

  const [description, setDescription] = useState('');
  const [buyerWallet, setBuyerWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AITemplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyzeDeal = async () => {
    if (!description.trim()) {
      setError('DESCRIPTION_REQUIRED');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessToken();

      const res = await fetch('http://localhost:3001/api/ai/template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'AI_ENGINE_FAILURE');
      }
    } catch (err: any) {
      console.error('[DASHBOARD] AI request failed:', err);
      setError('NETWORK_ERROR: ' + (err?.message || 'Connection refused'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* ── Top Bar ──────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-brand">
          <span className="brand-icon">◆</span>
          <span className="brand-name">PAKKA_DEAL</span>
        </div>
        <div className="dash-user-info">
          <div className="dash-score">
            <span className="score-label">PAKKA_SCORE:</span>
            <span className="score-value">{pakkaScore}</span>
          </div>
          <div className="dash-id">
            {user?.wallet?.address && (
              <span className="wallet-tag">
                {user.wallet.address.slice(0, 6)}...{user.wallet.address.slice(-4)}
              </span>
            )}
          </div>
          <button className="dash-logout" onClick={logout}>⏻</button>
        </div>
      </header>

      {/* ── Main Grid ────────────────────────────── */}
      <main className="dash-grid">
        {/* Left: Deal Input */}
        <section className="dash-panel input-panel">
          <div className="terminal-box">
            <div className="terminal-header">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
              <div className="header-title">DEAL_COMPOSER</div>
            </div>

            <div className="terminal-body">
              <h2 className="panel-title">{'>'} INITIATE_NEW_DEAL</h2>

              <div className="input-group">
                <label className="input-label">DEAL_DESCRIPTION:</label>
                <textarea
                  className="brutalist-textarea"
                  rows={5}
                  placeholder="Describe what you are selling and for how much... (Roman Urdu or English)&#10;&#10;Example: Mein apni Toyota Corolla 2022 bech raha hoon, price 45 lakh PKR, Lahore mein."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">BUYER_WALLET_ADDR:</label>
                <input
                  className="brutalist-input"
                  type="text"
                  placeholder="0x..."
                  value={buyerWallet}
                  onChange={(e) => setBuyerWallet(e.target.value)}
                />
              </div>

              <button
                className="brutalist-btn analyze-btn"
                onClick={handleAnalyzeDeal}
                disabled={loading}
              >
                <span className="btn-text">
                  {loading
                    ? '[ ANALYZING_PARAMETERS... ]'
                    : '> ANALYZE_WITH_AI'}
                </span>
                {!loading && <span className="cursor-blink">_</span>}
                {loading && <span className="spinner-inline"></span>}
              </button>

              {nullifier && (
                <div className="zk-badge-inline">
                  <span className="zk-dot"></span>
                  <span>ZK_VERIFIED</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right: AI Output */}
        <section className="dash-panel output-panel">
          <div className="terminal-box">
            <div className="terminal-header">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
              <div className="header-title">AI_RISK_ENGINE_v1</div>
            </div>

            <div className="terminal-body">
              <h2 className="panel-title">{'>'} AI_ANALYSIS_OUTPUT</h2>

              {/* Empty state */}
              {!result && !error && !loading && (
                <div className="output-empty">
                  <div className="empty-icon">⟁</div>
                  <p className="empty-text">
                    Awaiting deal parameters...
                  </p>
                  <p className="empty-sub">
                    Describe your deal on the left and click ANALYZE_WITH_AI
                  </p>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="output-loading">
                  <div className="scan-lines">
                    <div className="scan-line"></div>
                    <div className="scan-line"></div>
                    <div className="scan-line"></div>
                  </div>
                  <p className="loading-text">[ GEMINI_1.5_FLASH :: PROCESSING ]</p>
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="output-error">
                  <span className="error-icon">✕</span>
                  <span className="error-text">ERROR: {error}</span>
                </div>
              )}

              {/* Results */}
              {result && (
                <div className="output-results">
                  <div className="result-header">
                    <span className="result-status">◉ ANALYSIS_COMPLETE</span>
                  </div>

                  <div className="result-grid">
                    <div className="result-card highlight-card">
                      <span className="card-label">DEAL_TYPE</span>
                      <span className="card-value type-value">{result.dealType}</span>
                    </div>
                    <div className="result-card">
                      <span className="card-label">COLLATERAL_PCT</span>
                      <span className="card-value accent-value">{result.suggestedCollateralPct}%</span>
                    </div>
                    <div className="result-card">
                      <span className="card-label">GRACE_PERIOD</span>
                      <span className="card-value">{result.gracePeriodHours}h</span>
                    </div>
                    <div className="result-card">
                      <span className="card-label">LANGUAGE</span>
                      <span className="card-value">{result.detectedLanguage}</span>
                    </div>
                  </div>

                  <div className="result-section">
                    <span className="section-label">GENERATED_TITLE:</span>
                    <span className="section-value">{result.title}</span>
                  </div>

                  <div className="result-section">
                    <span className="section-label">MILESTONES ({result.milestones.length}):</span>
                    <div className="milestones-list">
                      {result.milestones.map((m, i) => (
                        <div key={i} className="milestone-row">
                          <span className="milestone-num">{String(i + 1).padStart(2, '0')}</span>
                          <span className="milestone-label">{m.label}</span>
                          <span className="milestone-pct">{m.percent}%</span>
                          <div className="milestone-bar">
                            <div
                              className="milestone-fill"
                              style={{ width: `${m.percent}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button className="brutalist-btn create-btn">
                    <span className="btn-text">{'>'} CREATE_DEAL_ON_CHAIN</span>
                    <span className="cursor-blink">_</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
