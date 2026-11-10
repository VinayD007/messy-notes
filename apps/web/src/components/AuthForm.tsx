import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../store/authStore';

export function AuthForm() {
  const { signIn, signUp, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInfoMessage(null);
    clearError();

    if (mode === 'signin') {
      await signIn(email, password).catch(() => undefined);
      return;
    }

    const result = await signUp(email, password).catch(() => null);
    if (result?.needsEmailConfirmation) {
      setInfoMessage('Check your email to confirm your account before signing in.');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <img src="/icon-192.png" alt="MessyNotes" className="brand-icon" />
          <h1>MessyNotes</h1>
          <p>Real-time synced notes, structured fields, and checklists.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field-label">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label className="field-label">
            Password
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
            />
          </label>

          {error && <p className="banner-error">{error}</p>}
          {infoMessage && <p className="banner-info">{infoMessage}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <button
          type="button"
          className="btn-link"
          onClick={() => {
            clearError();
            setInfoMessage(null);
            setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
          }}
        >
          {mode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
