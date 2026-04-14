import { useEffect, useState } from 'react';
import { useAnonAadhaar } from '@anon-aadhaar/react';
import './VerifyIdentity.css';

interface VerifyIdentityProps {
  onBypass?: (nullifier: string) => void;
}

export default function VerifyIdentity({ onBypass }: VerifyIdentityProps) {
  const [anonAadhaar, startReq] = useAnonAadhaar();
  const [nullifier, setNullifier] = useState<string | null>(null);

  useEffect(() => {
    if (anonAadhaar.status === 'logged-in') {
      const proof = anonAadhaar.anonAadhaarProofs?.[0];
      if (proof) {
        const n = (proof as any).pcd?.proof?.nullifier ?? (proof as any).nullifier ?? 'EXTRACTED';
        setNullifier(String(n));
        console.log('[ZK-PROOF] Nullifier:', n);
        console.log('[ZK-PROOF] Full proof object:', proof);
      }
    }
  }, [anonAadhaar]);

  const isVerified = anonAadhaar.status === 'logged-in';
  const isLoading = anonAadhaar.status === 'logging-in';

  return (
    <div className="verify-container">
      <div className="terminal-box">
        <div className="terminal-header">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
          <div className="header-title">ZK_IDENTITY_MODULE</div>
        </div>

        <div className="terminal-body">
          <h1 className="title">ZERO_KNOWLEDGE_VERIFICATION</h1>

          {!isVerified ? (
            <div className="verify-prompt">
              <div className="step-indicator">
                <div className="step completed">
                  <span className="step-num">01</span>
                  <span className="step-label">EMAIL_AUTH</span>
                  <span className="step-check">✓</span>
                </div>
                <div className="step-connector"></div>
                <div className={`step ${isLoading ? 'active' : 'pending'}`}>
                  <span className="step-num">02</span>
                  <span className="step-label">ZK_PROOF</span>
                  {isLoading && <span className="step-spinner"></span>}
                </div>
                <div className="step-connector"></div>
                <div className="step pending">
                  <span className="step-num">03</span>
                  <span className="step-label">DASHBOARD</span>
                </div>
              </div>

              <div className="instruction-block">
                <div className="instruction-icon">◈</div>
                <p className="instruction-text">
                  SCAN GOVERNMENT ID QR TO GENERATE ZK PROOF
                </p>
                <p className="instruction-sub">
                  Your identity is verified without revealing personal data.
                  Only age &gt; 18 is disclosed to the smart contract.
                </p>
              </div>

              {isLoading && (
                <div className="proof-generating">
                  <div className="spinner-bar">
                    <div className="spinner-fill"></div>
                  </div>
                  <span className="spinner-label">GENERATING_ZK_PROOF...</span>
                </div>
              )}

              <div className="aadhaar-widget">
                <button
                  className="brutalist-btn"
                  onClick={() => {
                    // @ts-expect-error - bypass strict AnonAadhaarArgs typing for headless login
                    startReq({ type: 'login', args: { nullifierSeed: 1234, fieldsToReveal: ['revealAgeAbove18'] } });
                  }}
                >
                  <span className="btn-text">{'>'} GENERATE_ZK_PROOF</span>
                  <span className="cursor-blink">_</span>
                </button>
              </div>

              <div className="security-note">
                <span className="lock-icon">⚿</span>
                <span>TEST MODE — Using synthetic Aadhaar QR for hackathon demo</span>
              </div>

              {onBypass && (
                <button
                  className="brutalist-btn bypass-btn"
                  onClick={() => onBypass('0x123456789abcdef0deadbeef42069faceb00c1337')}
                >
                  <span className="btn-text">{'>'} DEV_BYPASS: SIMULATE_ZK_PROOF</span>
                  <span className="cursor-blink">_</span>
                </button>
              )}
            </div>
          ) : (
            <div className="verify-success">
              <div className="success-badge">
                <div className="badge-ring"></div>
                <div className="badge-inner">ZK</div>
              </div>

              <div className="status-indicator">
                <div className="status-dot healthy"></div>
                <span>IDENTITY VERIFIED. PAKKA SCORE: 100</span>
              </div>

              <div className="data-grid">
                <div className="data-row">
                  <span className="data-label">VERIFICATION:</span>
                  <span className="data-value verified-text">ZERO_KNOWLEDGE_PROOF</span>
                </div>
                <div className="data-row">
                  <span className="data-label">AGE_CHECK:</span>
                  <span className="data-value verified-text">ABOVE_18 ✓</span>
                </div>
                {nullifier && (
                  <div className="data-row">
                    <span className="data-label">NULLIFIER:</span>
                    <span className="data-value nullifier-hash">
                      {nullifier.length > 20
                        ? `${nullifier.slice(0, 10)}...${nullifier.slice(-10)}`
                        : nullifier}
                    </span>
                  </div>
                )}
                <div className="data-row">
                  <span className="data-label">PRIVACY:</span>
                  <span className="data-value verified-text">NO_PII_DISCLOSED</span>
                </div>
              </div>

              <p className="redirect-notice">REDIRECTING_TO_DASHBOARD...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
