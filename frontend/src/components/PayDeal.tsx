import { useState, useEffect } from 'react';
import './PayDeal.css';

interface DealDetails {
  onChain: any;
  milestones: any[];
  cached: {
    title: string;
    dealType: string;
    amountPkr: string;
    sellerWallet: string;
    buyerWallet: string;
    currentState: string;
    milestoneCount: number;
    imagePreviews?: string[];
  } | null;
  aiRisk: any;
}

interface PayDealProps {
  dealId: number;
}

export default function PayDeal({ dealId }: PayDealProps) {
  const [deal, setDeal] = useState<DealDetails | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [jazzCashNumber, setJazzCashNumber] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);

  // Fetch deal details on mount
  useEffect(() => {
    const fetchDeal = async () => {
      try {
        const res = await fetch(`http://localhost:3001/deals/${dealId}`);
        const data = await res.json();

        if (data.success) {
          setDeal(data.data);
        } else {
          setFetchError(data.error || 'DEAL_NOT_FOUND');
        }
      } catch (err: any) {
        setFetchError('NETWORK_ERROR: ' + (err?.message || 'Connection refused'));
      } finally {
        setFetchLoading(false);
      }
    };

    fetchDeal();
  }, [dealId]);

  // ── Milestone data from on-chain ──
  const onChainMilestones: { label: string; amount: string; completed: boolean }[] = (() => {
    if (deal?.milestones && Array.isArray(deal.milestones) && deal.milestones.length > 0) {
      return deal.milestones.map((m: any) => ({
        label: m.label || m[0] || 'MILESTONE',
        amount: (m.amount ?? m[1] ?? '0').toString(),
        completed: m.completed ?? m[2] ?? false,
      }));
    }
    return [];
  })();

  const currentMilestoneIndex = Number(deal?.onChain?.currentMilestone ?? 0);
  const totalAmountPkr = Number(deal?.cached?.amountPkr) || 7700000;
  const sellerBondWei = deal?.onChain?.sellerBond?.toString() || '0';
  const hasSellerBond = sellerBondWei !== '0';

  const handlePayment = async () => {
    if (!jazzCashNumber || jazzCashNumber.length < 11) {
      setPayError('VALID_MOBILE_NUMBER_REQUIRED');
      return;
    }

    setPaying(true);
    setPayError(null);

    try {
      const res = await fetch(`http://localhost:3001/deals/${dealId}/pay-fiat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerAddress: '0x000000000000000000000000000000000000dEaD',
          amountPkr: totalAmountPkr,
          jazzCashNumber,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPaySuccess(true);
      } else {
        setPayError(data.error || 'PAYMENT_FAILED');
      }
    } catch (err: any) {
      console.error('[PAY] Fiat payment failed:', err);
      setPayError('NETWORK_ERROR: ' + (err?.message || 'Connection refused'));
    } finally {
      setPaying(false);
    }
  };

  // ── Loading State ──
  if (fetchLoading) {
    return (
      <div className="pay-container">
        <div className="pay-loading">
          <div className="pay-scan-lines">
            <div className="pay-scan-line"></div>
            <div className="pay-scan-line"></div>
            <div className="pay-scan-line"></div>
          </div>
          <p className="pay-loading-text">[ FETCHING_ON_CHAIN_DEAL... ]</p>
          <p className="pay-loading-sub">Deal #{dealId}</p>
        </div>
      </div>
    );
  }

  // ── Error State ──
  if (fetchError) {
    return (
      <div className="pay-container">
        <div className="terminal-box">
          <div className="terminal-header">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
            <div className="header-title">DEAL_ERROR</div>
          </div>
          <div className="terminal-body">
            <div className="pay-error-block">
              <span className="error-icon-lg">✕</span>
              <h2>DEAL_FETCH_FAILED</h2>
              <p>{fetchError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment Success State ──
  if (paySuccess) {
    return (
      <div className="pay-container">
        <div className="terminal-box pay-success-box">
          <div className="terminal-header">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
            <div className="header-title">ESCROW_CONFIRMATION</div>
          </div>
          <div className="terminal-body pay-success-body">
            <div className="success-glow">
              <div className="glow-ring"></div>
              <div className="glow-icon">⛓</div>
            </div>

            <h2 className="pay-success-title">[ FUNDS_LOCKED_IN_PAKKA_DEAL_SAFE ]</h2>

            <div className="pay-success-grid">
              <div className="result-card highlight-card">
                <span className="card-label">DEAL_ID</span>
                <span className="card-value type-value">#{dealId}</span>
              </div>
              <div className="result-card">
                <span className="card-label">STATUS</span>
                <span className="card-value accent-value">LOCKED</span>
              </div>
            </div>

            <div className="pay-success-message">
              <p className="success-line">TRANSACTION SUCCESSFUL.</p>
              <p className="success-sub">
                The AI Agent will now monitor the milestones.
                Funds are secured in the Pakka Deal Safe until
                both parties confirm delivery.
              </p>
            </div>

            <div className="pay-timeline">
              <div className="timeline-step done">
                <span className="tl-dot"></span>
                <span className="tl-label">PAYMENT_RECEIVED</span>
              </div>
              <div className="timeline-step done">
                <span className="tl-dot"></span>
                <span className="tl-label">FIAT_CONVERTED</span>
              </div>
              <div className="timeline-step done">
                <span className="tl-dot"></span>
                <span className="tl-label">FUNDS_LOCKED</span>
              </div>
              <div className="timeline-step pending">
                <span className="tl-dot"></span>
                <span className="tl-label">AWAITING_DELIVERY</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Deal View ──
  const cached = deal?.cached;
  const title = cached?.title || `Deal #${dealId}`;
  const dealType = cached?.dealType || 'GENERAL';
  const sellerAddr = cached?.sellerWallet || '—';
  const state = cached?.currentState || 'PENDING';
  const milestoneCount = cached?.milestoneCount || onChainMilestones.length || 1;

  return (
    <div className="pay-container">
      {/* ── Branding Bar ── */}
      <div className="pay-brand-bar">
        <span className="brand-icon">◆</span>
        <span className="brand-name">PAKKA_DEAL</span>
        <span className="pay-badge">SECURE_ESCROW</span>
      </div>

      <div className="pay-grid">
        {/* ── Left: Deal Details ── */}
        <section className="pay-panel">
          <div className="terminal-box">
            <div className="terminal-header">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
              <div className="header-title">DEAL_TERMS</div>
            </div>
            <div className="terminal-body">
              <h2 className="panel-title">{'>'} DEAL_#{dealId}</h2>

              <div className="pay-deal-title">{title}</div>

              <div className="pay-details-grid">
                <div className="pay-detail">
                  <span className="pay-detail-label">TYPE</span>
                  <span className="pay-detail-value pay-type">{dealType}</span>
                </div>
                <div className="pay-detail">
                  <span className="pay-detail-label">STATUS</span>
                  <span className="pay-detail-value pay-state">{state}</span>
                </div>
                <div className="pay-detail">
                  <span className="pay-detail-label">MILESTONES</span>
                  <span className="pay-detail-value">{milestoneCount}</span>
                </div>
                <div className="pay-detail">
                  <span className="pay-detail-label">SELLER</span>
                  <span className="pay-detail-value pay-addr">
                    {sellerAddr.length > 12
                      ? `${sellerAddr.slice(0, 6)}...${sellerAddr.slice(-4)}`
                      : sellerAddr}
                  </span>
                </div>
              </div>

              {/* ── Dual-Lock: Seller Bond Indicator ── */}
              <div className="pay-security-badges">
                <div className="sec-badge" style={{ borderColor: hasSellerBond ? '#00ff41' : '#ff4141' }}>
                  <span>{hasSellerBond ? '✓' : '✕'}</span>
                  {hasSellerBond
                    ? 'SELLER_ZAMANAT_LOCKED — Dual-Lock Active'
                    : 'SELLER_ZAMANAT_MISSING — Caution'}
                </div>
                <div className="sec-badge">
                  <span>⛓</span> Pakka Deal Safe (Digital Escrow)
                </div>
                <div className="sec-badge">
                  <span>⚿</span> ZK Identity Verified
                </div>
                <div className="sec-badge">
                  <span>◈</span> AI Risk Monitored
                </div>
              </div>

              {/* ── Milestone Breakdown ── */}
              {onChainMilestones.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontFamily: 'monospace', color: '#888', fontSize: '0.8rem', marginBottom: '8px' }}>
                    MILESTONE_BREAKDOWN ({onChainMilestones.length}):
                  </div>
                  {onChainMilestones.map((m, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', marginBottom: '4px',
                      background: m.completed ? '#0a2e0a' : i === currentMilestoneIndex ? '#1a1a2e' : '#111',
                      border: `1px solid ${m.completed ? '#00ff41' : i === currentMilestoneIndex ? '#e2b714' : '#333'}`,
                      fontFamily: 'monospace', fontSize: '0.85rem',
                    }}>
                      <span style={{ color: m.completed ? '#00ff41' : '#666', fontWeight: 700 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ flex: 1, color: m.completed ? '#00ff41' : '#ccc' }}>
                        {m.label}
                      </span>
                      <span style={{
                        color: m.completed ? '#00ff41' : i === currentMilestoneIndex ? '#e2b714' : '#666',
                        fontWeight: 700, fontSize: '0.75rem',
                      }}>
                        {m.completed ? 'RELEASED' : i === currentMilestoneIndex ? 'NEXT' : 'PENDING'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Item Images Gallery ── */}
              {cached?.imagePreviews && cached.imagePreviews.length > 0 && (
                <div className="pay-images-section">
                  <div className="pay-images-header">ITEM_IMAGES ({cached.imagePreviews.length})</div>
                  <div className="pay-images-grid">
                    {cached.imagePreviews.map((src, i) => (
                      <div key={i} className="pay-image-item">
                        <img src={src} alt={`Item ${i + 1}`} className="pay-image" />
                        <span className="pay-image-label">IMG_{String(i + 1).padStart(2, '0')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Right: Payment Gateway ── */}
        <section className="pay-panel">
          <div className="terminal-box pay-gateway-box">
            <div className="terminal-header">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
              <div className="header-title">FIAT_ON_RAMP</div>
            </div>
            <div className="terminal-body">
              <h2 className="panel-title">{'>'} SECURE_PAYMENT</h2>

              <div className="gateway-banner">
                <div className="gateway-icon">₨</div>
                <div className="gateway-text">
                  <span className="gateway-label">JAZZCASH / EASYPAISA</span>
                  <span className="gateway-sub">Fiat → Crypto → Pakka Deal Safe</span>
                </div>
              </div>

              {/* Show total deal amount — buyer locks full amount, milestones release staged */}
              <div style={{
                padding: '12px', marginBottom: '12px',
                background: '#1a1a2e', border: '2px solid #e2b714',
                fontFamily: 'monospace', color: '#e2b714', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>TOTAL_DEAL_AMOUNT</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                  Rs. {totalAmountPkr.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '4px' }}>
                  Full amount locked in Pakka Deal Safe — released to seller per milestone
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">JAZZCASH_MOBILE_NUMBER:</label>
                <input
                  className="brutalist-input"
                  type="tel"
                  placeholder="03XX-XXXXXXX"
                  maxLength={13}
                  value={jazzCashNumber}
                  onChange={(e) => setJazzCashNumber(e.target.value)}
                />
              </div>

              {payError && (
                <div className="pay-inline-error">
                  <span>✕</span> {payError}
                </div>
              )}

              <button
                className="brutalist-btn pay-btn"
                onClick={handlePayment}
                disabled={paying || state === 'LOCKED'}
              >
                <span className="btn-text">
                  {paying
                    ? '[ PROCESSING_FIAT_TO_CRYPTO... ]'
                    : state === 'LOCKED'
                      ? '[ FUNDS_ALREADY_LOCKED ]'
                      : `> LOCK FULL AMOUNT IN PAKKA DEAL SAFE (Rs. ${totalAmountPkr.toLocaleString()})`}
                </span>
                {!paying && state !== 'LOCKED' && <span className="cursor-blink">_</span>}
                {paying && <span className="spinner-inline"></span>}
              </button>

              <div className="pay-assurance">
                <p>◆ Full amount locked in Pakka Deal Safe, released per milestone.</p>
                <p>◆ Seller has locked Zamanat (guarantee deposit) — dual-lock active.</p>
                <p>◆ Dispute resolution via 3-arbitrator panel.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
