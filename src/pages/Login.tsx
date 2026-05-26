import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Key, Mail, ShieldAlert, Sparkles, Building, AlertCircle } from 'lucide-react';

export default function Login() {
  const { signInWithEmail, loginAsDemoUser, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError('Please fill in all credentials fields');
      return;
    }
    setLocalError(null);
    setIsLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      // If Firebase Auth yields exceptions, we look for matches to fall back gracefully or show message
      setLocalError(err.message || 'Authentication failed. Please verify email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setIsLoading(true);
    setLocalError(null);
    try {
      await loginAsDemoUser(demoEmail);
    } catch (err: any) {
      setLocalError(err.message || 'Error entering Demo Mode');
    } finally {
      setIsLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 font-sans" id="login-container">
      
      {/* Upper Logo / Brand header */}
      <div className="max-w-md w-full text-center space-y-3 mb-8" id="login-brand-header">
        <div className="inline-flex p-3 bg-accent rounded-2xl text-primary ring-4 ring-orange-50" id="login-brand-icon-wrapper">
          <Building className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Hunters Paradise Cottages
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Internal Sales CRM Management Portal
        </p>
      </div>

      {/* Main card */}
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 space-y-6" id="login-form-card">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Welcome Back</h2>
          <p className="text-xs text-slate-400 mt-1">Please log in to your employee account.</p>
        </div>

        {/* Errors Display */}
        {(localError || authError) && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-xs text-[#993C1D] flex items-start gap-3" id="login-error-display">
            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Authentication Notice</p>
              <p className="mt-0.5 text-slate-600 leading-relaxed">{localError || authError}</p>
            </div>
          </div>
        )}

        {/* Regular Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4" id="login-form-credentials">
          <div className="relative">
            <label className="text-[11px] font-bold text-slate-500 tracking-wider uppercase block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jackson.munene@huntersparadise.ke"
                className="w-full bg-slate-50 border border-slate-200 outline-none text-sm text-slate-800 py-3 pl-10 pr-4 rounded-xl focus:border-primary focus:bg-white transition-all focus:ring-1 focus:ring-primary"
                id="login-email-input"
              />
            </div>
          </div>

          <div className="relative">
            <label className="text-[11px] font-bold text-slate-500 tracking-wider uppercase block mb-1">Password</label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 outline-none text-sm text-slate-800 py-3 pl-10 pr-4 rounded-xl focus:border-primary focus:bg-white transition-all focus:ring-1 focus:ring-primary"
                id="login-password-input"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-secondary text-white py-3.5 px-4 rounded-xl font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            id="login-submit-button"
          >
            <LogIn className="w-4 h-4" />
            {isLoading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>

        <div className="relative flex py-2 items-center text-slate-300" id="login-divider-separator">
          <div className="flex-grow border-t border-slate-100"></div>
          <span className="flex-shrink mx-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">Or Demo Roles (Single Click)</span>
          <div className="flex-grow border-t border-slate-100"></div>
        </div>

        {/* Demo Persona bypass quick logins */}
        <div className="space-y-2.5" id="login-demo-personas-grid">
          <p className="text-[11px] text-slate-400 text-center font-medium">To test permissions easily without console setup:</p>
          
          <div className="grid grid-cols-2 gap-2">
            
            {/* Super Admin */}
            <button
              onClick={() => handleDemoLogin('jackson.munene@huntersparadise.ke')}
              disabled={isLoading}
              className="p-3 bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 rounded-xl text-left transition-all group"
              id="login-demo-superadmin"
            >
              <span className="block text-[10px] font-bold text-red-500 tracking-wider uppercase">Super Admin</span>
              <span className="block text-xs font-semibold text-slate-800 mt-0.5">Jackson Munene</span>
              <span className="block text-[9px] text-slate-400 mt-1">Full control, both branches</span>
            </button>

            {/* Senior Manager */}
            <button
              onClick={() => handleDemoLogin('calvince.okomo@huntersparadise.ke')}
              disabled={isLoading}
              className="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-100 hover:border-amber-200 rounded-xl text-left transition-all group"
              id="login-demo-seniormanager"
            >
              <span className="block text-[10px] font-bold text-amber-600 tracking-wider uppercase">Senior Manager</span>
              <span className="block text-xs font-semibold text-slate-800 mt-0.5">Calvince Okomo</span>
              <span className="block text-[9px] text-slate-400 mt-1">Combined team pipeline</span>
            </button>

            {/* Manager */}
            <button
              onClick={() => handleDemoLogin('jane.adala@huntersparadise.ke')}
              disabled={isLoading}
              className="p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 hover:border-indigo-200 rounded-xl text-left transition-all group"
              id="login-demo-manager"
            >
              <span className="block text-[10px] font-bold text-indigo-500 tracking-wider uppercase">Cottages Manager</span>
              <span className="block text-xs font-semibold text-slate-800 mt-0.5">Jane Adala</span>
              <span className="block text-[9px] text-slate-400 mt-1">Own branch & data limits</span>
            </button>

            {/* Sales Executive */}
            <button
              onClick={() => handleDemoLogin('mildred@huntersparadise.ke')}
              disabled={isLoading}
              className="p-3 bg-teal-50 hover:bg-teal-100 border border-teal-100 hover:border-teal-200 rounded-xl text-left transition-all group"
              id="login-demo-executive"
            >
              <span className="block text-[10px] font-bold text-teal-600 tracking-wider uppercase">Tuuti Sales Rep</span>
              <span className="block text-xs font-semibold text-slate-800 mt-0.5">Mildred Rep</span>
              <span className="block text-[9px] text-slate-400 mt-1">Own Pipeline & create quotes</span>
            </button>

          </div>
        </div>

      </div>

      <p className="mt-8 text-xs text-slate-400 font-medium tracking-wide">
        Security Note: All session queries are scoped strictly to the employee's assigned permissions.
      </p>

      {/* Embedded footer */}
      <footer className="mt-12 text-center text-xs text-slate-500 font-sans">
        Built by{' '}
        <a 
          href="https://nex-chi-six.vercel.app/" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[#D85A30] hover:underline font-semibold"
          id="login-footer-link"
        >
          Jackson Mwaniki Munene — Nex
        </a>
      </footer
      >
    </div>
  );
}
