import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '320px' }}>
        <h2 style={{ marginBottom: '1rem', textAlign: 'center' }}>SmartToken Login</h2>
        {error && <div style={{ color: 'red', marginBottom: '0.5rem', textAlign: 'center' }}>{error}</div>}
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem' }}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem' }}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '0.75rem', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Login
        </button>
      </form>
    </div>
  );
}
