import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AnimatePresence, motion } from 'motion/react';
import { 
  Building, LayoutDashboard, Layers, Users, Calendar, 
  FileText, Target, LogOut, ShieldAlert, Badge, UserCircle, Menu, X, Landmark, Activity
} from 'lucide-react';

// CRM Subpages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Clients from './pages/Clients';
import Bookings from './pages/Bookings';
import Quotations from './pages/Quotations';
import Targets from './pages/Targets';
import Footer from './components/Footer';
import NotificationBell from './components/NotificationBell';

type ActiveTab = 'dashboard' | 'pipeline' | 'clients' | 'bookings' | 'quotations' | 'targets';

function AppShell() {
  const { userProfile, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // If session is unauthenticated, redirect immediately to our login portal
  if (!userProfile) {
    return <Login />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pipeline', label: 'Sales Pipeline', icon: Layers },
    { id: 'clients', label: 'Clients & Guests', icon: Users },
    { id: 'bookings', label: 'Occupancy Bookings', icon: Calendar },
    { id: 'quotations', label: 'Quotations Pitch', icon: FileText },
    { id: 'targets', label: 'Monthly Targets', icon: Target },
  ] as const;

  // Branch theme badges
  const branchBadgeText = userProfile.branchPreference === 'Both' 
    ? 'HPC Cross-Branch Admin' 
    : `HPC ${userProfile.branchPreference} Branch`;

  return (
    <div className="min-h-screen bg-[#FAECE7] flex flex-col md:flex-row font-sans text-[#2C2C2A]" id="crm-main-shell">
      
      {/* 1. SIDEBAR (DESKTOP) */}
      <aside className="hidden md:flex flex-col w-64 bg-[#993C1D] text-white border-r border-white/10 shrink-0" id="crm-desktop-sidebar">
        {/* Brand Banner */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#D85A30] rounded flex items-center justify-center font-bold text-lg italic shrink-0">HP</div>
            <h1 className="text-sm font-semibold tracking-tight uppercase leading-tight">
              Hunters Paradise<br />
              <span className="text-[10px] font-normal opacity-85 text-[#FAECE7] tracking-normal capitalize">Cottages & Tuuti</span>
            </h1>
          </div>
        </div>

        {/* User profile capsule */}
        <div className="p-4 border-b border-white/10 bg-white/5 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#FAECE7] text-[#993C1D] flex items-center justify-center font-extrabold text-xs ring-2 ring-white/10 rounded-xl">
              {userProfile.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="truncate">
              <strong className="text-xs font-bold text-white block truncate leading-tight">{userProfile.name}</strong>
              <span className="text-[10px] text-white/70 font-medium block truncate mt-0.5">{userProfile.email}</span>
            </div>
          </div>
          <span className="inline-block text-[9.5px] font-bold text-white bg-white/10 border border-white/10 px-2 py-0.5 rounded-full w-full text-center">
            {branchBadgeText}
          </span>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold font-sans transition-colors cursor-pointer ${
                  isActive 
                    ? 'bg-white/10 text-white border-l-4 border-[#D85A30]' 
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
                id={`nav-item-${item.id}`}
              >
                <Icon className={`w-4 h-4 shrink-0 col-span-1 ${isActive ? 'text-[#D85A30]' : 'text-white/60'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Logout bottom trigger */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={signOutUser}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            id="sidebar-logout-button"
          >
            <LogOut className="w-4 h-4 text-[#D85A30]" />
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>

      {/* 2. MOBILE TOP NAV HEADER */}
      <header className="md:hidden bg-[#993C1D] text-white p-4 flex items-center justify-between border-b border-white/10 shadow" id="crm-mobile-header">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#D85A30] rounded flex items-center justify-center font-bold text-xs italic">HP</div>
          <h1 className="font-extrabold text-xs tracking-tight">HPC Internal CRM</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Mobile notification bell placement */}
          <NotificationBell />
          
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1 text-white/80 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Slide */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#993C1D] border-b border-white/10 shadow-xl overflow-hidden text-white font-sans z-40"
            id="mobile-drawer-view"
          >
            <div className="p-4 space-y-3">
              <span className="text-[10px] text-white bg-white/10 border border-white/10 p-2 rounded-xl block text-center font-bold uppercase tracking-wider">
                {userProfile.name} • {branchBadgeText}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-bold ${isActive ? 'bg-[#D85A30] text-white' : 'bg-white/10 text-white/80'}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={signOutUser}
                className="w-full bg-white/5 hover:bg-white/10 hover:text-white text-white/95 py-2.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-4 h-4 text-[#D85A30]" />
                <span>Log Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. CORE VIEW CANVAS BOX */}
      <div className="flex-1 flex flex-col min-w-0" id="crm-content-canvas">
        {/* Top Header Row for desktop (contains notification bell, secondary info) */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-slate-100 shadow-xs shrink-0" id="crm-desktop-header">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            <span>Secure Enterprise Connection Real-time Active</span>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Header Notifications dropdown */}
            <NotificationBell />
            
            <div className="h-5 w-[1px] bg-slate-100" />
            <span className="text-xs font-bold text-slate-700">Role: <span className="text-primary">{userProfile.role}</span></span>
          </div>
        </header>

        {/* Main Content scroll window with premium animation slides */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 flex flex-col justify-between" id="crm-view-holder">
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-7xl mx-auto"
                id={`animated-view-${activeTab}`}
              >
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'pipeline' && <Pipeline />}
                {activeTab === 'clients' && <Clients />}
                {activeTab === 'bookings' && <Bookings />}
                {activeTab === 'quotations' && <Quotations />}
                {activeTab === 'targets' && <Targets />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Embedded Credit footer built on every single logged page in layout */}
          <Footer />
        </main>
      </div>

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
