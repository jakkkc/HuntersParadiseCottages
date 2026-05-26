import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, where, onSnapshot, doc, 
  addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc
} from 'firebase/firestore';
import { PipelineDeal, ClientProfile, InAppReminder, ActivityLog } from '../types';
import { 
  KanbanSquare, List, Plus, Search, MapPin, 
  DollarSign, Clock, Calendar, MessageSquare, ArrowRightLeft,
  Trash2, User, RefreshCw, Layers, FileText, CheckCircle
} from 'lucide-react';
import { createGoogleCalendarEvent, formatFollowUpEvent } from '../utils/calendar';

const STAGES = ['Lead', 'Inquiry', 'Proposal', 'Confirmed', 'Checked In', 'Completed'] as const;
const LEAD_SOURCES = ['Walk-in', 'Phone', 'Email', 'WhatsApp', 'Social Media', 'Referral'] as const;

export default function Pipeline() {
  const { userProfile, googleToken } = useAuth();
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<'All' | 'Cottages' | 'Tuuti'>('All');
  const [loading, setLoading] = useState(true);

  // Modal / inspector states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null);
  const [dealLogs, setDealLogs] = useState<ActivityLog[]>([]);

  // Create Deal Form State
  const [clientId, setClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [clientType, setClientType] = useState<'corporate' | 'individual'>('corporate');
  const [branch, setBranch] = useState<'Cottages' | 'Tuuti'>('Cottages');
  const [dealValue, setDealValue] = useState(15000);
  const [leadSource, setLeadSource] = useState<typeof LEAD_SOURCES[number]>('Walk-in');
  const [expectedDate, setExpectedDate] = useState('');
  const [dealNotes, setDealNotes] = useState('');

  // Follow up reminder state
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDesc, setReminderDesc] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderSyncCalendar, setReminderSyncCalendar] = useState(false);

  // Log activity state
  const [logActionText, setLogActionText] = useState('');

  const isManagement = userProfile?.role === 'Super Admin' || userProfile?.role === 'Senior Manager';

  // Load Deals & Clients
  useEffect(() => {
    if (!userProfile) return;

    let dealsQuery = collection(db, 'pipeline');
    if (!isManagement) {
      dealsQuery = query(collection(db, 'pipeline'), where('assignedTo', '==', userProfile.userId)) as any;
    }

    const unsubscribeDeals = onSnapshot(dealsQuery, (snapshot) => {
      const list: PipelineDeal[] = [];
      snapshot.forEach((doc) => {
        list.push({ dealId: doc.id, ...doc.data() } as PipelineDeal);
      });
      setDeals(list);
      setLoading(false);
    });

    // Load available manual client list for matching dropdowns
    let clientsQuery = collection(db, 'clients');
    if (!isManagement) {
      clientsQuery = query(collection(db, 'clients'), where('assignedTo', '==', userProfile.userId)) as any;
    }
    const unsubscribeClients = onSnapshot(clientsQuery, (snapshot) => {
      const list: ClientProfile[] = [];
      snapshot.forEach((doc) => {
        list.push({ clientId: doc.id, ...doc.data() } as ClientProfile);
      });
      setClients(list);
    });

    return () => {
      unsubscribeDeals();
      unsubscribeClients();
    };
  }, [userProfile, isManagement]);

  // Read logs for selected deal in real-time
  useEffect(() => {
    if (!selectedDeal) return;

    const logsQuery = query(
      collection(db, 'activity_logs'),
      where('refId', '==', selectedDeal.dealId),
      where('type', '==', 'deal')
    );

    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const logs: ActivityLog[] = [];
      snapshot.forEach((doc) => {
        logs.push({ logId: doc.id, ...doc.data() } as ActivityLog);
      });
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setDealLogs(logs);
    });

    return () => unsubscribeLogs();
  }, [selectedDeal]);

  // Utility to calculate days spent in current stage
  const getDaysInCurrentStage = (deal: PipelineDeal) => {
    const fromDate = deal.stageChangedAt ? new Date(deal.stageChangedAt) : new Date(deal.createdAt);
    const diffTime = Math.abs(new Date().getTime() - fromDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 65 * 60 * 24));
    return diffDays <= 1 ? "1 Day" : `${diffDays} Days`;
  };

  const formatKES = (val: number) => {
    return 'KES ' + val.toLocaleString('en-KE');
  };

  // DragnDrop trigger stage translation
  const handleStageChange = async (dealId: string, nextStage: typeof STAGES[number]) => {
    try {
      const dealRef = doc(db, 'pipeline', dealId);
      const dealSnap = await getDoc(dealRef);
      if (!dealSnap.exists()) return;

      const dealData = dealSnap.data() as PipelineDeal;
      const oldStage = dealData.stage;
      
      const updateData = {
        stage: nextStage,
        stageChangedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await updateDoc(dealRef, updateData);

      // Write unified audit log entry
      await addDoc(collection(db, 'activity_logs'), {
        refId: dealId,
        type: 'deal',
        action: `Moved stage from ${oldStage} to ${nextStage}`,
        performedBy: userProfile?.email || 'System',
        performedByName: userProfile?.name || 'CRM Agent',
        timestamp: new Date().toISOString()
      });

      // Update local state if currently viewing in inspector
      if (selectedDeal && selectedDeal.dealId === dealId) {
        setSelectedDeal({ ...selectedDeal, ...updateData });
      }

      // If deal moves directly to 'Confirmed' or 'Completed' and we are in real-time, update associated monthly targets
      if ((nextStage === 'Confirmed' || nextStage === 'Completed') && (oldStage !== 'Confirmed' && oldStage !== 'Completed')) {
        await patchRevenueTarget(dealData.assignedTo, dealData.value);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Set revenue increment helper on target
  const patchRevenueTarget = async (userId: string, value: number) => {
    try {
      const today = new Date();
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const targetId = `${userId}_${year}_${month}`;

      const targetRef = doc(db, 'targets', targetId);
      const targetSnap = await getDoc(targetRef);

      if (targetSnap.exists()) {
        const curTarget = targetSnap.data();
        await updateDoc(targetRef, {
          actualRevenue: (curTarget.actualRevenue || 0) + value,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Find user name and email from profile
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        const udata = userSnap.data();
        
        await setDoc(targetRef, {
          targetId,
          userId,
          userEmail: udata?.email || '',
          userName: udata?.name || 'Sales Rep',
          year,
          month,
          targetValue: 0, // Let management set this later
          actualRevenue: value,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn("Target revenue override fails:", e);
    }
  };

  // Create new pipeline inquiry
  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName && !clientId) {
      alert("Please match an existing profile or write a new prospect name");
      return;
    }

    try {
      let finalClientId = clientId;
      let finalClientName = newClientName;

      // If user typed a new name, automatically create a basic guest or corporate profile
      if (!clientId) {
        const clientRef = await addDoc(collection(db, 'clients'), {
          type: clientType,
          companyName: clientType === 'corporate' ? newClientName : '',
          fullName: clientType === 'individual' ? newClientName : '',
          assignedTo: userProfile?.userId || '',
          assignedToName: userProfile?.name || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        finalClientId = clientRef.id;
        
        // Feed ID back into document schema
        await updateDoc(doc(db, 'clients', finalClientId), { clientId: finalClientId });
      } else {
        const matched = clients.find(c => c.clientId === clientId);
        finalClientName = matched?.companyName || matched?.fullName || newClientName;
      }

      const dealRef = await addDoc(collection(db, 'pipeline'), {
        clientId: finalClientId,
        clientName: finalClientName,
        clientType,
        branch,
        value: Number(dealValue),
        source: leadSource,
        assignedTo: userProfile?.userId || '',
        assignedToName: userProfile?.name || 'Sales Rep',
        stage: 'Lead',
        expectedDate: expectedDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: dealNotes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stageChangedAt: new Date().toISOString(),
      });

      const generatedDealId = dealRef.id;
      await updateDoc(doc(db, 'pipeline', generatedDealId), { dealId: generatedDealId });

      // Trace logs
      await addDoc(collection(db, 'activity_logs'), {
        refId: generatedDealId,
        type: 'deal',
        action: `Inbound Lead created for ${finalClientName}`,
        performedBy: userProfile?.email || 'Sales rep',
        performedByName: userProfile?.name || 'CRM Agent',
        timestamp: new Date().toISOString()
      });

      // Clear states
      setClientId('');
      setNewClientName('');
      setDealNotes('');
      setExpectedDate('');
      setIsCreateOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  // Add customized comment log onto Deal
  const handleAddDealLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeal || !logActionText) return;

    try {
      await addDoc(collection(db, 'activity_logs'), {
        refId: selectedDeal.dealId,
        type: 'deal',
        action: logActionText,
        performedBy: userProfile?.email || 'Sales Employee',
        performedByName: userProfile?.name || 'CRM Representative',
        timestamp: new Date().toISOString()
      });
      setLogActionText('');
    } catch (err) {
      console.error(err);
    }
  };

  // Submit and create in-app reminder + optional sync to Google Calendar
  const handleSetReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeal || !reminderTitle || !reminderDate) return;

    try {
      const isodat = new Date(reminderDate).toISOString();
      
      // 1. Save to in_app_reminders
      await addDoc(collection(db, 'in_app_reminders'), {
        title: `${reminderTitle}`,
        description: `${reminderDesc} (Ref Deal: ${selectedDeal.clientName})`,
        date: isodat,
        userId: userProfile?.userId || '',
        read: false,
        refId: selectedDeal.dealId,
        refType: 'deal',
        createdAt: new Date().toISOString()
      });

      // 2. Sync to Google Calendar using workspace integration OAuth access token if checked
      if (reminderSyncCalendar && googleToken) {
        const calEvent = formatFollowUpEvent(selectedDeal.clientName, reminderDesc, isodat);
        const result = await createGoogleCalendarEvent(googleToken, calEvent);
        if (result.success) {
          alert("Reminder successfully synced to your corporate Google Calendar!");
        } else {
          alert(`In-app alert created. Note: Google Calendar sync skipped: ${result.error}`);
        }
      }

      // Record in logs
      await addDoc(collection(db, 'activity_logs'), {
        refId: selectedDeal.dealId,
        type: 'deal',
        action: `Set follow-up reminder: "${reminderTitle}" on ${new Date(reminderDate).toLocaleString()}`,
        performedBy: userProfile?.email || 'Sales rep',
        performedByName: userProfile?.name || 'CRM Advisor',
        timestamp: new Date().toISOString()
      });

      setReminderTitle('');
      setReminderDesc('');
      setReminderDate('');
      setReminderSyncCalendar(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Deal Safeguard Call
  const handleDeleteDeal = async (dealId: string) => {
    const confirmDelete = window.confirm("Are you absolutely sure you want to delete this pipeline deal? This operation can't be undone.");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'pipeline', dealId));
      setSelectedDeal(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Filtering pipelines
  const filteredDeals = deals.filter(deal => {
    const matchesSearch = deal.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          deal.source.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBranch = branchFilter === 'All' ? true : deal.branch === branchFilter;
    return matchesSearch && matchesBranch;
  });

  return (
    <div className="space-y-6 px-1 font-sans" id="pipeline-root-control">
      
      {/* Top action dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" id="pipeline-top-actions">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
            <Layers className="text-primary w-5.5 h-5.5" />
            HPC Sales Pipeline Board
          </h2>
          <p className="text-xs text-slate-500">
            Track inquiries, advance prospects through hospitality stages or toggles.
          </p>
        </div>

        {/* View togglers + Lead creator */}
        <div className="flex items-center gap-2">
          
          <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200" id="view-mode-toggle-group">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-lg text-slate-600 transition-all ${viewMode === 'kanban' ? 'bg-white text-primary shadow-sm' : 'hover:bg-slate-50'}`}
              title="Kanban Board"
            >
              <KanbanSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg text-slate-600 transition-all ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'hover:bg-slate-50'}`}
              title="Detail List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary hover:bg-secondary text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            id="register-inquiry-button"
          >
            <Plus className="w-4 h-4" />
            <span>New Inquiry</span>
          </button>
        </div>
      </div>

      {/* Grid Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#993C1D] shadow-sm p-4 flex flex-col md:flex-row gap-4" id="pipeline-filters-dock">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search inquiries by client name, source..."
            className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-700 py-2.5 pl-10 pr-4 rounded-xl focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary"
            id="pipeline-search-input"
          />
        </div>

        {/* Branch selectors */}
        <div className="flex items-center gap-1.5 shrink-0" id="branch-quick-selectors">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Branch Focus:</span>
          {(['All', 'Cottages', 'Tuuti'] as const).map(b => (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${branchFilter === b ? 'bg-accent border-primary text-secondary shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state indicator */}
      {loading ? (
        <div className="flex justify-center items-center h-44 text-slate-400 font-medium text-xs">
          Loading client leads & pipelines...
        </div>
      ) : (
        <>
          {/* VIEW: KANBAN BOARD */}
          {viewMode === 'kanban' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start" id="kanban-pipeline-grid">
              {STAGES.map((stage) => {
                const stageDeals = filteredDeals.filter(d => d.stage === stage);
                const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);

                return (
                  <div 
                    key={stage} 
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col min-h-[500px]"
                    id={`kanban-tier-${stage.toLowerCase().replace(' ', '-')}`}
                  >
                    {/* Header tier info */}
                    <div className="mb-3.5 flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 border-b-2 border-[#D85A30] shadow-sm shrink-0">
                      <div>
                        <h3 className="font-bold text-xs text-slate-800 tracking-tight">{stage}</h3>
                        <span className="text-[10px] text-slate-400 font-semibold">{formatKES(stageTotal)}</span>
                      </div>
                      <span className="p-1 h-5 min-w-5 flex items-center justify-content-center bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 rounded-full">
                        <span className="mx-auto">{stageDeals.length}</span>
                      </span>
                    </div>

                    {/* Cards Scroll */}
                    <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[500px] pb-4" id={`scroller-row-${stage}`}>
                      {stageDeals.map((deal) => (
                        <div
                          key={deal.dealId}
                          onClick={() => setSelectedDeal(deal)}
                          className={`bg-white rounded-xl border-l-[4px] border border-slate-200 hover:border-slate-300 p-3.5 shadow-sm hover:shadow transition-all cursor-pointer group relative ${deal.branch === 'Tuuti' ? 'border-l-[#993C1D]' : 'border-l-[#D85A30]'}`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <h4 className="font-bold text-xs text-slate-800 break-words line-clamp-2 leading-relaxed group-hover:text-primary">
                              {deal.clientName}
                            </h4>
                          </div>

                          <span className="text-[10px] font-sans text-slate-400 block mt-1">Estimations (Value):</span>
                          <span className="text-xs font-extrabold text-[#993C1D] block mt-0.5">{formatKES(deal.value)}</span>

                          {/* Detail badges info */}
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            <span className="bg-slate-50 text-[9px] font-semibold text-slate-500 px-1.5 py-0.5 rounded border border-slate-100">
                              {deal.source}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${deal.branch === 'Tuuti' ? 'bg-amber-100 text-[#993C1D]' : 'bg-orange-100 text-[#D85A30]'}`}>
                              {deal.branch}
                            </span>
                          </div>

                          <div className="mt-3 border-t border-slate-100 pt-2 flex justify-between items-center text-[10px] text-slate-400 font-sans">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-300" />
                              {getDaysInCurrentStage(deal)}
                            </span>
                            <span className="font-semibold text-slate-500">
                              {deal.assignedToName || 'Rep'}
                            </span>
                          </div>
                        </div>
                      ))}

                      {stageDeals.length === 0 && (
                        <div className="text-center py-8 text-[11px] text-slate-400 font-medium">No prospects</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* VIEW: SEARCH LIST TAB */
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" id="pipeline-list-container">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-sans text-left min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Client Prospect</th>
                      <th className="py-3 px-4">Est Value val</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4">Lead Source Code</th>
                      <th className="py-3 px-4">Inquiry Stage</th>
                      <th className="py-3 px-4">Expected Date</th>
                      <th className="py-3 px-4">Days in Stage</th>
                      <th className="py-3 px-4 text-center">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDeals.map((deal) => (
                      <tr key={deal.dealId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-800">{deal.clientName}</td>
                        <td className="py-3.5 px-4 font-extrabold text-[#993C1D]">{formatKES(deal.value)}</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${deal.branch === 'Tuuti' ? 'bg-amber-100 text-[#993C1D]' : 'bg-orange-100 text-[#D85A30]'}`}>
                            {deal.branch}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">{deal.source}</td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-100 border border-slate-200 font-medium text-slate-700 px-2 py-0.5 rounded-full text-[10px]">
                            {deal.stage}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-500">{new Date(deal.expectedDate).toLocaleDateString()}</td>
                        <td className="py-3.5 px-4 font-medium text-slate-400">{getDaysInCurrentStage(deal)}</td>
                        <td className="py-3.5 px-4 text-center">
                          <button 
                            onClick={() => setSelectedDeal(deal)}
                            className="bg-[#FAECE7] text-[#D85A30] hover:bg-[#D85A30] hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                          >
                            Inspector
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: CREATE NEW PROSPECT / LEAD */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto font-sans" id="create-deal-modal">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Layers className="text-primary w-5 h-5" />
                <span>Log New Sales Prospect Inquiry</span>
              </h3>
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateDeal} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 tracking-wider uppercase block mb-1">Target Account Name Type</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button 
                    type="button"
                    onClick={() => setClientType('corporate')}
                    className={`p-2 rounded-xl text-xs font-bold border ${clientType === 'corporate' ? 'bg-primary border-primary text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  >
                    Corporate Organization
                  </button>
                  <button 
                    type="button"
                    onClick={() => setClientType('individual')}
                    className={`p-2 rounded-xl text-xs font-bold border ${clientType === 'individual' ? 'bg-primary border-primary text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                  >
                    Individual Guest
                  </button>
                </div>
              </div>

              {/* Match or new */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Link Existing Client Profile</label>
                <select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    if (e.target.value) setNewClientName(''); // Reset typing if matched
                  }}
                  className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-700 p-2.5 rounded-xl block focus:border-primary"
                  id="prospect-profile-selector"
                >
                  <option value="">-- [None] - Create New Client Auto --</option>
                  {clients.map(c => (
                    <option key={c.clientId} value={c.clientId}>
                      {c.type === 'corporate' ? `${c.companyName} (Company)` : `${c.fullName} (Guest)`}
                    </option>
                  ))}
                </select>
              </div>

              {!clientId && (
                <div className="relative">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Prospect / New Client Name</label>
                  <input 
                    type="text" 
                    required 
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="e.g. Kakamega County Assembly / Dr. Alfred"
                    className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-800 p-2.5 rounded-xl block focus:border-primary"
                    id="prospect-new-client-name"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">HPC Branch Destination</label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-700 p-2.5 rounded-xl focus:border-primary"
                  >
                    <option value="Cottages">Hunters Paradise Cottages</option>
                    <option value="Tuuti">Hunters Paradise Tuuti</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Estimated Value (KES)</label>
                  <input 
                    type="number" 
                    required
                    value={dealValue}
                    onChange={(e) => setDealValue(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-800 p-2.5 rounded-xl focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Inquiry Lead Source</label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-700 p-2.5 rounded-xl focus:border-primary"
                  >
                    {LEAD_SOURCES.map(source => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Expected Close/Arrival Date</label>
                  <input 
                    type="date" 
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-800 p-2.5 rounded-xl focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Inquiry specifications / Event notes</label>
                <textarea 
                  value={dealNotes}
                  onChange={(e) => setDealNotes(e.target.value)}
                  placeholder="Include accommodation numbers, meal plans, or custom conference details requested by client..."
                  className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-800 p-2.5 rounded-xl h-20 block focus:border-primary"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-primary hover:bg-secondary text-white py-3 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer text-center"
              >
                Log Inquiry to Pipeline
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR DETAIL INSPECTOR: SELECTED DEAL DETAILS */}
      {selectedDeal && (
        <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white border-l border-slate-100 shadow-2xl z-50 flex flex-col font-sans" id="deal-detail-inspector">
          {/* Header Panel */}
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
            <div>
              <span className="text-[9px] font-bold text-[#D85A30] bg-[#FAECE7] px-2 py-0.5 rounded uppercase tracking-wider">
                Pipeline Deal ID: {selectedDeal.dealId.substring(0, 8)}
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm mt-1">{selectedDeal.clientName}</h3>
            </div>
            <button 
              onClick={() => setSelectedDeal(null)}
              className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1 bg-white border border-slate-200 rounded-lg h-8 w-8 flex items-center justify-center transition-all shadow-xs"
            >
              &times;
            </button>
          </div>

          {/* Inspector Body Scroll */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5" id="inspector-scrollable">
            
            {/* Quick Metrics grid */}
            <div className="grid grid-cols-2 gap-3.5 bg-slate-50/50 border border-slate-100 rounded-xl p-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estimated Value</span>
                <span className="text-sm font-extrabold text-primary block mt-0.5">{formatKES(selectedDeal.value)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch Location</span>
                <span className="text-xs font-bold text-slate-700 block mt-1">{selectedDeal.branch}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Expected Date</span>
                <span className="text-xs font-semibold text-slate-500 block mt-1">
                  {new Date(selectedDeal.expectedDate).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Lead Source</span>
                <span className="text-xs font-semibold text-slate-600 block mt-1">{selectedDeal.source}</span>
              </div>
            </div>

            {/* Quick Stage shifting tools */}
            <div className="space-y-2 border-t border-slate-150 pt-3">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Sales Journey Stage Actions</label>
              <div className="grid grid-cols-3 gap-1.5" id="stage-shifting-quickactions">
                {STAGES.map(stg => (
                  <button
                    key={stg}
                    onClick={() => handleStageChange(selectedDeal.dealId, stg)}
                    className={`p-2 rounded-lg text-[10px] font-bold border transition-all truncate text-center ${selectedDeal.stage === stg ? 'bg-[#D85A30] border-[#D85A30] text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    {stg}
                  </button>
                ))}
              </div>
            </div>

            {/* In-App Tasks & Reminders generator */}
            <div className="bg-orange-50/20 border border-orange-100/50 rounded-xl p-4 space-y-3.5">
              <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary" />
                <span>Create Follow-up Reminders Sync</span>
              </h4>
              <form onSubmit={handleSetReminder} className="space-y-2 text-xs">
                <input 
                  type="text" 
                  required
                  placeholder="Task title (e.g., Call client back, Send quote)"
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 outline-none p-2 rounded-lg focus:border-primary"
                />
                <textarea 
                  placeholder="Task reminders specifications (e.g. negotiation terms discuss)"
                  value={reminderDesc}
                  onChange={(e) => setReminderDesc(e.target.value)}
                  className="w-full bg-white border border-slate-200 outline-none p-2 rounded-lg h-12 focus:border-primary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="datetime-local" 
                    required
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    className="bg-white border border-slate-200 p-2 rounded-lg focus:border-primary outline-none"
                  />
                  <div className="flex items-center gap-1.5 px-2">
                    <input 
                      type="checkbox" 
                      id="remind-sync-google"
                      checked={reminderSyncCalendar}
                      onChange={(e) => {
                        if (e.target.checked && !googleToken) {
                          alert("Google Calendar is not authorized. Please connect it in the header dropdown panel first.");
                          return;
                        }
                        setReminderSyncCalendar(e.target.checked);
                      }}
                      className="accent-primary"
                    />
                    <label htmlFor="remind-sync-google" className="text-[10px] text-slate-500 font-bold select-none cursor-pointer">Sync to Google Calendar</label>
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full bg-[#D85A30] text-white py-1.5 rounded-lg font-bold shadow-xs hover:bg-secondary cursor-pointer transition-all uppercase tracking-wide text-[10px]"
                >
                  Schedule Reminder Task
                </button>
              </form>
            </div>

            {/* Activity Logging on deal */}
            <div className="space-y-3 border-t border-slate-150 pt-3">
              <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span>Log Sales Action Activities</span>
              </h4>
              <form onSubmit={handleAddDealLog} className="flex gap-2">
                <input 
                  type="text" 
                  required
                  value={logActionText}
                  onChange={(e) => setLogActionText(e.target.value)}
                  placeholder="e.g. Discussed pricing over phone; client accepted rate card"
                  className="flex-1 bg-slate-50 border border-slate-200 outline-none text-xs p-2 rounded-xl focus:border-primary"
                />
                <button 
                  type="submit"
                  className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer"
                >
                  Log
                </button>
              </form>

              {/* logs display */}
              <div className="space-y-2 h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                {dealLogs.length === 0 ? (
                  <p className="text-[10px] text-slate-400 text-center py-10 font-medium">No system activity trail on this inquiry yet.</p>
                ) : (
                  dealLogs.map(log => (
                    <div key={log.logId} className="pt-2 pb-1 text-[11px] font-sans">
                      <div className="flex justify-between text-slate-400 text-[10px]">
                        <span className="font-semibold text-slate-600">{log.performedByName}</span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-700 font-medium mt-0.5">{log.action}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Delete Option if Super Admin */}
            {isManagement && (
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleDeleteDeal(selectedDeal.dealId)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Deal Record</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
