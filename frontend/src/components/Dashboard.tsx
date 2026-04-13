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

interface ActiveDeal {
  id: number;
  title: string;
  status: 'FUNDS_LOCKED' | 'COMPLETED' | 'DISPUTED';
  amount: string;
  buyer: string;
}

interface Notification {
  type: 'success' | 'warning' | 'info';
  message: string;
}

interface DashboardProps {
  pakkaScore?: number;
  nullifier?: string | null;
}

export default function Dashboard({ pakkaScore = 100, nullifier }: DashboardProps) {
  const { getAccessToken, user, logout } = usePrivy();

  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AITemplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deal creation state
  const [creating, setCreating] = useState(false);
  const [dealSuccess, setDealSuccess] = useState<{
    dealId: number;
    txHash: string;
    metadataCid: string | null;
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Active deals management
  const [activeDeals, setActiveDeals] = useState<ActiveDeal[]>([
    { id: 1, title: 'iPhone 14 Pro Max — Lahore DHA Deal', status: 'FUNDS_LOCKED', amount: '200,000 PKR', buyer: '0x7a3...f1c9' },
    { id: 2, title: 'Honda Civic 2020 — Islamabad Transfer', status: 'FUNDS_LOCKED', amount: '3,500,000 PKR', buyer: '0x2e8...a4b2' },
  ]);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [processingDealId, setProcessingDealId] = useState<number | null>(null);

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

  const handleCreateDeal = async () => {
    if (!result) return;

    setCreating(true);
    setError(null);

    try {
      const token = await getAccessToken();
      const sellerAddress = user?.wallet?.address || '0x0000000000000000000000000000000000000000';

      // Convert milestone percentages into wei amounts
      // For demo: use a placeholder total amount (e.g., description-extracted or 1 ETH)
      const totalAmountWei = '1000000000000000000'; // 1 ETH placeholder
      const milestoneLabels = result.milestones.map((m) => m.label);
      const milestoneAmounts = result.milestones.map((m) =>
        String(Math.floor((m.percent / 100) * 1e18))
      );

      const res = await fetch('http://localhost:3001/api/deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerAddress,
          dealType: result.dealType === 'CAR' ? 0 : result.dealType === 'PROPERTY' ? 1 : 2,
          totalAmountWei,
          collateralPercent: result.suggestedCollateralPct,
          milestoneLabels,
          milestoneAmounts,
          title: result.title,
          amountPkr: 0,
          buyerWallet: '0x0000000000000000000000000000000000000000',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setDealSuccess(data.data);
        // Add to active deals
        setActiveDeals((prev) => [
          ...prev,
          {
            id: data.data.dealId,
            title: result.title,
            status: 'FUNDS_LOCKED',
            amount: '—',
            buyer: 'ASSIGNED_ON_PAYMENT',
          },
        ]);
      } else {
        setError(data.error || 'DEAL_CREATION_FAILED');
      }
    } catch (err: any) {
      console.error('[DASHBOARD] Deal creation failed:', err);
      setError('CONTRACT_ERROR: ' + (err?.message || 'Transaction failed'));
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!dealSuccess) return;
    const link = `${window.location.origin}/pay/${dealSuccess.dealId}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      // Fallback for non-HTTPS
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    }
  };

  const showNotification = (n: Notification) => {
    setNotification(n);
    setTimeout(() => setNotification(null), 5000);
  };

  const handleReleaseFunds = async (id: number) => {
    setProcessingDealId(id);
    try {
      const token = await getAccessToken();
      // Attempt real call, fall back to mock
      try {
        await fetch(`http://localhost:3001/api/deals/${id}/state`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ newState: 'COMPLETED' }),
        });
      } catch {
        // Silently mock for demo
      }
      setActiveDeals((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: 'COMPLETED' } : d))
      );
      showNotification({
        type: 'success',
        message: '[ FUNDS_SUCCESSFULLY_TRANSFERRED_TO_SELLER ]',
      });
    } finally {
      setProcessingDealId(null);
    }
  };

  const handleRaiseDispute = async (id: number) => {
    setProcessingDealId(id);
    try {
      const token = await getAccessToken();
      try {
        await fetch(`http://localhost:3001/api/deals/${id}/state`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ newState: 'DISPUTED' }),
        });
      } catch {
        // Silently mock for demo
      }
      setActiveDeals((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: 'DISPUTED' } : d))
      );
      showNotification({
        type: 'warning',
        message: '[ AI_ARBITRATION_INITIATED ] — 3 Human Arbitrators alerted.',
      });
    } finally {
      setProcessingDealId(null);
    }
  };

  return (
    <div className="dashboard-container">
      {/* ── Notification Toast ────────────────────── */}
      {notification && (
        <div className={`dash-toast toast-${notification.type}`}>
          <span className="toast-icon">
            {notification.type === 'success' ? '✓' : notification.type === 'warning' ? '⚠' : '◆'}
          </span>
          <span className="toast-text">{notification.message}</span>
          <button className="toast-close" onClick={() => setNotification(null)}>✕</button>
        </div>
      )}

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

          {/* ── Active Deals ── */}
          {activeDeals.length > 0 && (
            <div className="terminal-box active-deals-box">
              <div className="terminal-header">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
                <div className="header-title">ACTIVE_DEALS ({activeDeals.length})</div>
              </div>
              <div className="terminal-body">
                <h2 className="panel-title">{'>'} MANAGE_ESCROW</h2>

                {activeDeals.map((deal) => (
                  <div key={deal.id} className={`deal-card deal-status-${deal.status.toLowerCase()}`}>
                    <div className="deal-card-header">
                      <span className="deal-card-id">#{deal.id}</span>
                      <span className={`deal-card-status status-${deal.status.toLowerCase()}`}>
                        {deal.status}
                      </span>
                    </div>
                    <div className="deal-card-title">{deal.title}</div>
                    <div className="deal-card-meta">
                      <span>{deal.amount}</span>
                      <span className="deal-card-buyer">BUYER: {deal.buyer}</span>
                    </div>

                    {deal.status === 'FUNDS_LOCKED' && (
                      <div className="deal-card-actions">
                        <button
                          className="brutalist-btn release-btn"
                          onClick={() => handleReleaseFunds(deal.id)}
                          disabled={processingDealId === deal.id}
                        >
                          <span className="btn-text">
                            {processingDealId === deal.id
                              ? '[ PROCESSING... ]'
                              : '> RELEASE_FUNDS'}
                          </span>
                        </button>
                        <button
                          className="brutalist-btn dispute-btn"
                          onClick={() => handleRaiseDispute(deal.id)}
                          disabled={processingDealId === deal.id}
                        >
                          <span className="btn-text">
                            {'>'} RAISE_DISPUTE
                          </span>
                        </button>
                      </div>
                    )}

                    {deal.status === 'COMPLETED' && (
                      <div className="deal-card-resolved">
                        <span className="resolved-icon">✓</span>
                        <span>FUNDS_RELEASED</span>
                      </div>
                    )}

                    {deal.status === 'DISPUTED' && (
                      <div className="deal-card-disputed">
                        <span className="disputed-icon">⚠</span>
                        <span>ARBITRATION_IN_PROGRESS</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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

                  <button
                    className="brutalist-btn create-btn"
                    onClick={handleCreateDeal}
                    disabled={creating}
                  >
                    <span className="btn-text">
                      {creating
                        ? '[ INITIATING_SMART_CONTRACT... ]'
                        : '> CREATE_DEAL_ON_CHAIN'}
                    </span>
                    {!creating && <span className="cursor-blink">_</span>}
                    {creating && <span className="spinner-inline"></span>}
                  </button>
                </div>
              )}

              {/* Deal Deployed Success */}
              {dealSuccess && (
                <div className="output-results deal-success">
                  <div className="success-glow">
                    <div className="glow-ring"></div>
                    <div className="glow-icon">✓</div>
                  </div>

                  <h3 className="success-title">[ DEAL_SMART_CONTRACT_DEPLOYED ]</h3>

                  <div className="result-grid">
                    <div className="result-card highlight-card">
                      <span className="card-label">DEAL_ID</span>
                      <span className="card-value type-value">#{dealSuccess.dealId}</span>
                    </div>
                    <div className="result-card">
                      <span className="card-label">STATUS</span>
                      <span className="card-value accent-value">ON_CHAIN</span>
                    </div>
                  </div>

                  <div className="result-section">
                    <span className="section-label">TX_HASH:</span>
                    <span className="section-value tx-hash">
                      {dealSuccess.txHash.slice(0, 18)}...{dealSuccess.txHash.slice(-12)}
                    </span>
                  </div>

                  <div className="result-section buyer-link-section">
                    <span className="section-label">BUYER_PAYMENT_LINK:</span>
                    <span className="section-value link-value">
                      {window.location.origin}/pay/{dealSuccess.dealId}
                    </span>
                  </div>

                  <button
                    className="brutalist-btn copy-btn"
                    onClick={handleCopyLink}
                  >
                    <span className="btn-text">
                      {linkCopied
                        ? '◉ LINK_COPIED_TO_CLIPBOARD'
                        : '> COPY_LINK_FOR_BUYER'}
                    </span>
                    {!linkCopied && <span className="cursor-blink">_</span>}
                  </button>

                  <button
                    className="brutalist-btn new-deal-btn"
                    onClick={() => {
                      setDealSuccess(null);
                      setResult(null);
                      setDescription('');
                    }}
                  >
                    <span className="btn-text">{'>'} CREATE_ANOTHER_DEAL</span>
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
