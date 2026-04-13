import { usePrivy } from '@privy-io/react-auth';
import './Login.css';

export default function Login() {
  const { login, ready, authenticated, user, logout } = usePrivy();

  if (!ready) {
    return <div className="login-container loading">[ SYSTEM_INIT ]</div>;
  }

  return (
    <div className="login-container">
      <div className="terminal-box">
        <div className="terminal-header">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
          <div className="header-title">PAKKA_DEAL_SECURE_AUTH</div>
        </div>
        
        <div className="terminal-body">
          <h1 className="title">IDENTITY_VERIFICATION</h1>
          
          {!authenticated ? (
            <div className="auth-prompt">
              <p className="subtitle">Secure Escrow Protocol requires authentication to proceed.</p>
              <button className="brutalist-btn" onClick={login}>
                <span className="btn-text">{'>'} INITIALIZE_LOGIN_VIA_SMS</span>
                <span className="cursor-blink">_</span>
              </button>
            </div>
          ) : (
            <div className="auth-success">
              <div className="status-indicator">
                <div className="status-dot healthy"></div>
                <span>ACCESS_GRANTED</span>
              </div>
              
              <div className="data-grid">
                <div className="data-row">
                  <span className="data-label">USER_ID:</span>
                  <span className="data-value highlight">{user?.id}</span>
                </div>
                {user?.wallet?.address && (
                  <div className="data-row">
                    <span className="data-label">EMBEDDED_WALLET:</span>
                    <span className="data-value wallet-address">{user.wallet.address}</span>
                  </div>
                )}
              </div>
              
              <button className="brutalist-btn logout-btn" onClick={logout}>
                <span className="btn-text">{'>'} TERMINATE_SESSION</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
