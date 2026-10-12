import React from 'react';
import { Navigate } from 'react-router-dom';

function isTokenValid(token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const payload = JSON.parse(atob(base64));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return false; // Token has expired
    }
    return true;
  } catch {
    return false;
  }
}

export default function ProtectedRoute({ children }) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('smarttoken_token') : null;
  if (!isTokenValid(token)) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('smarttoken_token');
    }
    return <Navigate to="/login" replace />;
  }
  return children;
}
