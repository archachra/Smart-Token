import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThemeSwitcher from '../components/ThemeSwitcher.jsx';

// Simple base64url decoder for JWT payload
function decodeJwtPayload(token) {
  if (!token) return {};
  const payload = token.split('.')[1] || '';
  // Pad base64 string
  let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Login failed: ${res.status} ${txt}`);
      }
      const data = await res.json();
      const token = data.token;
      localStorage.setItem('smarttoken_token', token);
      const payload = decodeJwtPayload(token);
      const role = payload.role;
      // Redirect based on role
      if (role === 'ADMIN') {
        navigate('/admin');
      } else if (role === 'FACULTY') {
        navigate('/participation');
      } else if (role === 'STUDENT') {
        navigate('/student');
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-top-bar">
        <ThemeSwitcher />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-circle">🪙</div>
          <h2 className="login-title">SmartToken</h2>
          <p className="login-subtitle">Attendance & Micro-Token Classroom Ledger</p>
        </div>
        {error && <div className="login-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Email or Roll Number</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@smarttoken.edu or Roll Number"
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="login-submit-btn">
            Sign In to Classroom →
          </button>
        </form>
      </div>
    </div>
  );
}
