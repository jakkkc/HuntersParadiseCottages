import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, where, onSnapshot, doc, 
  addDoc, updateDoc, deleteDoc, getDoc 
} from 'firebase/firestore';
import { ClientProfile, UserProfile } from '../types';
import { 
  Users, Building2, UserCircle2, Search, Plus, 
  Phone, Mail, FileSpreadsheet, MapPin, Tag, 
  NotebookTabs, ArrowRight, Trash2, Edit2, ShieldAlert
} from 'lucide-react';

export default function Clients() {
  const { userProfile } = useAuth();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'corporate' | 'individual'>('corporate');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Inspector States
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form Profile State
  const [type, setType] = useState<'corporate' | 'individual'>('corporate');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idPassport, setIdPassport] = useState('');
  
  // Primary Contact Corporate info
  const [pContactName, setPContactName] = useState('');
  const [pContactTitle, setPContactTitle] = useState('');
  const [pContactPhone, setPContactPhone] = useState('');
  const [pContactEmail, setPContactEmail] = useState('');
  
  // Assigned rep Override
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [branchPreference, setBranchPreference] = useState<'Cottages' | 'Tuuti' | 'Both'>('Cottages');

  // Negotiated Corporate Overrides state
  const [tempOverrideKey, setTempOverrideKey] = useState('');
  const [tempOverrideVal, setTempOverrideVal] = useState('');

  const isManagement = userProfile?.role === 'Super Admin' || userProfile?.role === 'Senior Manager';

  // Load Client profiles & Sales Exec database list
  useEffect(() => {
    if (!userProfile) return;

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
      setLoading(false);
    });

    // Fetch team directory for assignment selectors
    const teamQuery = collection(db, 'users');
    const unsubscribeTeam = onSnapshot(teamQuery, (snapshot) => {
      const ulist: UserProfile[] = [];
      snapshot.forEach(doc => {
        ulist.push(doc.data() as UserProfile);
      });
      setEmployees(ulist);
    });

    return () => {
      unsubscribeClients();
      unsubscribeTeam();
    };
  }, [userProfile, isManagement]);

  // Handle client creation / modification
  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const representative = employees.find(emp => emp.userId === (assignedTo || userProfile?.userId)) || userProfile;
      const payload: Partial<ClientProfile> = {
        type,
        companyName: type === 'corporate' ? companyName : '',
        industry: type === 'corporate' ? industry : '',
        physicalAddress: type === 'corporate' ? physicalAddress : '',
        kraPin: type === 'corporate' ? kraPin : '',
        primaryContact: type === 'corporate' ? {
          name: pContactName,
          title: pContactTitle,
          phone: pContactPhone,
          email: pContactEmail
        } : undefined,

        fullName: type === 'individual' ? fullName : '',
        email: type === 'individual' ? email : email,
        phone: type === 'individual' ? phone : phone,
        idPassport: type === 'individual' ? idPassport : '',

        notes,
        assignedTo: representative?.userId || '',
        assignedToName: representative?.name || '',
        branchPreference: branchPreference as any,
        updatedAt: new Date().toISOString()
      };

      if (isEditing && selectedClient) {
        const clientRef = doc(db, 'clients', selectedClient.clientId);
        await updateDoc(clientRef, payload);
        setSelectedClient({ ...selectedClient, ...payload });
        setIsEditing(false);
      } else {
        const freshPayload = {
          ...payload,
          negotiatedRates: {},
          createdAt: new Date().toISOString()
        };
        const ref = await addDoc(collection(db, 'clients'), freshPayload);
        await updateDoc(doc(db, 'clients', ref.id), { clientId: ref.id });
      }

      // Reset form variables
      resetForm();
      setIsCreateOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setCompanyName('');
    setIndustry('');
    setPhysicalAddress('');
    setKraPin('');
    setFullName('');
    setEmail('');
    setPhone('');
    setIdPassport('');
    setPContactName('');
    setPContactTitle('');
    setPContactPhone('');
    setPContactEmail('');
    setNotes('');
    setAssignedTo(userProfile?.userId || '');
    setBranchPreference('Cottages');
    setIsEditing(false);
  };

  const handleEditClick = (client: ClientProfile) => {
    setType(client.type);
    setCompanyName(client.companyName || '');
    setIndustry(client.industry || '');
    setPhysicalAddress(client.physicalAddress || '');
    setKraPin(client.kraPin || '');
    setFullName(client.fullName || '');
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setIdPassport(client.idPassport || '');
    
    if (client.primaryContact) {
      setPContactName(client.primaryContact.name || '');
      setPContactTitle(client.primaryContact.title || '');
      setPContactPhone(client.primaryContact.phone || '');
      setPContactEmail(client.primaryContact.email || '');
    }
    
    setNotes(client.notes || '');
    setAssignedTo(client.assignedTo || '');
    setBranchPreference(client.branchPreference || 'Cottages');
    
    setIsEditing(true);
    setIsCreateOpen(true);
  };

  // Save negotiated custom overrides onto corporate profiles (Super Admin ONLY)
  const handleAddNegotiatedRate = async () => {
    if (!selectedClient || !tempOverrideKey || !tempOverrideVal) return;
    try {
      const updatedOverrides = {
        ...(selectedClient.negotiatedRates || {}),
        [tempOverrideKey]: Number(tempOverrideVal)
      };

      const ref = doc(db, 'clients', selectedClient.clientId);
      await updateDoc(ref, { negotiatedRates: updatedOverrides });

      setSelectedClient({
        ...selectedClient,
        negotiatedRates: updatedOverrides
      });

      setTempOverrideKey('');
      setTempOverrideVal('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveNegotiatedRate = async (key: string) => {
    if (!selectedClient) return;
    try {
      const updatedOverrides = { ...(selectedClient.negotiatedRates || {}) };
      delete updatedOverrides[key];

      const ref = doc(db, 'clients', selectedClient.clientId);
      await updateDoc(ref, { negotiatedRates: updatedOverrides });

      setSelectedClient({
        ...selectedClient,
        negotiatedRates: updatedOverrides
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Safe delete
  const handleDeleteClient = async (clientId: string) => {
    const confirmDelete = window.confirm("Are you positive you wish to delete this client profile? All history remains unlinked.");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'clients', clientId));
      setSelectedClient(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Filter clients
  const filteredClients = clients.filter(c => {
    if (c.type !== activeTab) return false;
    const term = searchQuery.toLowerCase();
    
    if (c.type === 'corporate') {
      return (c.companyName || '').toLowerCase().includes(term) ||
             (c.industry || '').toLowerCase().includes(term) ||
             (c.primaryContact?.name || '').toLowerCase().includes(term);
    } else {
      return (c.fullName || '').toLowerCase().includes(term) ||
             (c.phone || '').toLowerCase().includes(term) ||
             (c.email || '').toLowerCase().includes(term);
    }
  });

  return (
    <div className="space-y-6 px-1 font-sans" id="clients-root-page">
      
      {/* Top action blocks */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" id="clients-top-actions">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-primary w-5.5 h-5.5" />
            Guest & Corporate Profiles CRM
          </h2>
          <p className="text-xs text-slate-500">
            Maintain touchpoints, list travel history, and log negotiated event rates.
          </p>
        </div>

        <button
          onClick={() => { resetForm(); setType(activeTab); setIsCreateOpen(true); }}
          className="bg-primary hover:bg-secondary text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm shadow-orange-100 flex items-center gap-1.5 transition-all cursor-pointer"
          id="create-client-profile-button"
        >
          <Plus className="w-4 h-4" />
          <span>Add Client Card</span>
        </button>
      </div>

      {/* Categories Tabs + Search */}
      <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#D85A30] shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4" id="clients-filters-control">
        
        {/* Toggle tabs */}
        <div className="flex bg-slate-150 p-1.5 rounded-xl border border-slate-200 w-full md:w-80" id="client-type-tabs">
          <button
            onClick={() => { setActiveTab('corporate'); setSelectedClient(null); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center justify-center gap-1.5 ${activeTab === 'corporate' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Corporate Organizations</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('individual'); setSelectedClient(null); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-sans transition-all flex items-center justify-center gap-1.5 ${activeTab === 'individual' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <UserCircle2 className="w-3.5 h-3.5" />
            <span>Individual Guests</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'corporate' ? 'Search by organization name, industry, contact name...' : 'Search by guest name, phone, email...'}
            className="w-full bg-slate-50 border border-slate-200 outline-none text-xs text-slate-705 p-2.5 pl-10 pr-4 rounded-xl focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary"
            id="client-search-input"
          />
        </div>

      </div>

      {/* Grid displays */}
      {loading ? (
        <div className="text-center py-16 text-xs text-slate-400 font-medium">Loading database accounts...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="clients-display-grid">
          {filteredClients.map((client) => (
            <div
              key={client.clientId}
              onClick={() => setSelectedClient(client)}
              className="bg-white rounded-2xl border border-slate-200 border-b-2 hover:border-b-4 hover:border-b-[#993C1D] p-5 shadow-xs hover:shadow transition-all cursor-pointer flex flex-col justify-between h-44 group"
            >
              <div>
                <div className="flex justify-between items-start gap-1">
                  <h3 className="font-extrabold text-sm text-slate-800 leading-snug break-words line-clamp-2 group-hover:text-primary transition-colors">
                    {client.type === 'corporate' ? client.companyName : client.fullName}
                  </h3>
                  <span className="p-1.5 bg-slate-50 rounded-xl text-slate-400 border border-slate-100">
                    {client.type === 'corporate' ? <Building2 className="w-4 h-4" /> : <UserCircle2 className="w-4 h-4" />}
                  </span>
                </div>

                <div className="mt-3.5 space-y-1.5 text-xs text-slate-500">
                  {client.type === 'corporate' ? (
                    <>
                      <div className="flex items-center gap-1">
                        <UserCircle2 className="w-3.5 h-3.5 text-slate-400 inline" />
                        <span>Contact: <strong>{client.primaryContact?.name || '[Unspecified]'}</strong> ({client.primaryContact?.title})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-slate-400 inline" />
                        <span>Industry: {client.industry || 'Not set'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400 inline" />
                        <span>Phone: {client.phone || '[No phone]'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400 inline" />
                        <span>Email: {client.email || '[No email]'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-400">
                <span className="text-slate-500">Assigned: <strong>{client.assignedToName || 'Rep'}</strong></span>
                <span className="flex items-center gap-0.5 text-[#D85A30] font-bold">
                  View card
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}

          {filteredClients.length === 0 && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-16 bg-white rounded-2xl border border-slate-100 text-xs text-slate-400 font-medium">
              No matching profiles log. Click 'Add Client Card' to start manual entry!
            </div>
          )}
        </div>
      )}

      {/* FORM MODAL: CREATE OR EDIT PROFILE */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto font-sans" id="client-form-modal">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[#D85A30] text-sm flex items-center gap-1.5">
                <Users className="w-5 h-5 text-primary" />
                <span>{isEditing ? 'Modify Employee Accounts Profile' : 'Add Manual CRM Client profile'}</span>
              </h3>
              <button 
                onClick={() => { resetForm(); setIsCreateOpen(false); }}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleClientSubmit} className="space-y-4 text-xs">
              
              {!isEditing && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Target Account Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => setType('corporate')}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-center ${type === 'corporate' ? 'bg-primary border-primary text-white shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                    >
                      Corporate Enterprise
                    </button>
                    <button 
                      type="button"
                      onClick={() => setType('individual')}
                      className={`p-2.5 rounded-xl border font-bold transition-all text-center ${type === 'individual' ? 'bg-primary border-primary text-white shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                    >
                      Individual Guest Profile
                    </button>
                  </div>
                </div>
              )}

              {/* SPECIFIC FORM: CORPORATE CLIENT */}
              {type === 'corporate' ? (
                <div className="space-y-3.5" id="corporate-profile-form-elements">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Company / Organization name</label>
                      <input 
                        type="text" required
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Kakamega Teachers Association"
                        className="w-full bg-slate-50 border border-slate-200 outline-none p-2.5 rounded-xl text-slate-800 font-medium focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Industry Segment</label>
                      <input 
                        type="text"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="e.g., Education, Finance, NGO"
                        className="w-full bg-slate-50 border border-slate-200 outline-none p-2.5 rounded-xl focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Physical Location Address</label>
                      <input 
                        type="text"
                        value={physicalAddress}
                        onChange={(e) => setPhysicalAddress(e.target.value)}
                        placeholder="e.g. Mumias Rd, Bungoma"
                        className="w-full bg-slate-50 border border-slate-200 outline-none p-2.5 rounded-xl focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">KRA PIN Number (Optional)</label>
                      <input 
                        type="text"
                        value={kraPin}
                        onChange={(e) => setKraPin(e.target.value)}
                        placeholder="P051234567A"
                        className="w-full bg-slate-50 border border-slate-200 outline-none p-2.5 rounded-xl focus:border-primary uppercase"
                      />
                    </div>
                  </div>

                  {/* Primary Contact details */}
                  <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl space-y-2.5">
                    <h4 className="font-bold text-[10px] uppercase text-slate-400 tracking-wider">Primary contact person details</h4>
                    
                    <div className="grid grid-cols-2 gap-2.5">
                      <input 
                        type="text" required
                        placeholder="Contact Full Name"
                        value={pContactName}
                        onChange={(e) => setPContactName(e.target.value)}
                        className="bg-white border border-slate-200 outline-none p-2 rounded-lg"
                      />
                      <input 
                        type="text" required
                        placeholder="Official Title (e.g. HR, Director)"
                        value={pContactTitle}
                        onChange={(e) => setPContactTitle(e.target.value)}
                        className="bg-white border border-slate-200 outline-none p-2 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <input 
                        type="text" required
                        placeholder="Contact Telephone"
                        value={pContactPhone}
                        onChange={(e) => setPContactPhone(e.target.value)}
                        className="bg-white border border-slate-200 outline-none p-2 rounded-lg"
                      />
                      <input 
                        type="email" required
                        placeholder="Contact Business Email"
                        value={pContactEmail}
                        onChange={(e) => setPContactEmail(e.target.value)}
                        className="bg-white border border-slate-200 outline-none p-2 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* SPECIFIC FORM: INDIVIDUAL GUEST */
                <div className="space-y-3.5" id="individual-profile-form-elements">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Guest Full Name</label>
                      <input 
                        type="text" required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Dr. Alfred Wanjala"
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-slate-800 font-medium focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">ID / Passport Number (Optional)</label>
                      <input 
                        type="text"
                        value={idPassport}
                        onChange={(e) => setIdPassport(e.target.value)}
                        placeholder="e.g. 29384756"
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-primary outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Official Email Address</label>
                      <input 
                        type="email" required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alfred.wanjala@gmail.com"
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Telephone Connection</label>
                      <input 
                        type="text" required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+254 712 345 678"
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-primary outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SHARED GENERALS: Assignment, preference, notes */}
              <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Branch Preference</label>
                  <select
                    value={branchPreference}
                    onChange={(e) => setBranchPreference(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  >
                    <option value="Cottages">Hunters Paradise Cottages</option>
                    <option value="Tuuti">Hunters Paradise Tuuti</option>
                    <option value="Both">Both Branches Preference</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Assign Sales Advisor</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  >
                    <option value="">-- Let system inherit --</option>
                    {employees.map(emp => (
                      <option key={emp.userId} value={emp.userId}>{emp.name} ({emp.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Corporate Notes / remarks / VIP markers</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Insert notes regarding customized catering tastes, physical requirements, historical summaries, or key company traits..."
                  className="w-full bg-slate-50 border border-slate-200 outline-none p-2.5 rounded-xl h-20"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-primary hover:bg-secondary text-white py-3 rounded-xl font-bold text-xs shadow-md shadow-orange-100 transition-all cursor-pointer text-center"
              >
                {isEditing ? 'Save Modified Client' : 'Commit Client Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR DETAIL INSPECTOR: CLIENT PROFILE CARD VIEW */}
      {selectedClient && (
        <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white border-l border-slate-100 shadow-2xl z-50 flex flex-col font-sans" id="client-detail-inspector">
          {/* Header Panel */}
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
            <div>
              <span className="text-[9px] font-bold text-[#D85A30] bg-[#FAECE7] px-2 py-0.5 rounded uppercase tracking-wider">
                Account ID: {selectedClient.clientId.substring(0, 8)} • Preference: {selectedClient.branchPreference || 'Both'}
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm mt-1">
                {selectedClient.type === 'corporate' ? selectedClient.companyName : selectedClient.fullName}
              </h3>
            </div>
            <button 
              onClick={() => setSelectedClient(null)}
              className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1 bg-white border border-slate-200 rounded-lg h-8 w-8 flex items-center justify-center transition-all shadow-xs animate-none"
            >
              &times;
            </button>
          </div>

          {/* Scrolling client bio */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5" id="client-inspector-scrollable">
            
            {/* Core Bio Info */}
            <div className="space-y-3.5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="font-bold text-xs text-slate-800">Operational Bio Contacts</h4>
                <button 
                  onClick={() => handleEditClick(selectedClient)}
                  className="bg-slate-100 hover:bg-slate-200 p-1.5 rounded-lg text-slate-600 transition-colors flex items-center gap-1 text-[10px] font-bold"
                >
                  <Edit2 className="w-3 h-3 text-primary" />
                  <span>Modify Card</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                {selectedClient.type === 'corporate' ? (
                  <>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Primary Representative</span>
                      <strong className="text-slate-800 block mt-0.5">{selectedClient.primaryContact?.name}</strong>
                      <span className="text-slate-400 block">{selectedClient.primaryContact?.title}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Contact Mobile</span>
                      <span className="text-slate-700 block mt-0.5">{selectedClient.primaryContact?.phone}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Primary Corporate Email</span>
                      <span className="text-slate-700 block mt-0.5">{selectedClient.primaryContact?.email}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">KRA PIN Number</span>
                      <span className="text-slate-700 block mt-0.5 uppercase">{selectedClient.kraPin || '[None listed]'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Industry Sector</span>
                      <span className="text-slate-700 block mt-0.5">{selectedClient.industry || '[Not set]'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Billing Physical Address</span>
                      <span className="text-slate-705 block mt-0.5">{selectedClient.physicalAddress || '[None specified]'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Direct Line Telephone</span>
                      <span className="text-slate-750 block mt-0.5">{selectedClient.phone || '[No phone]'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Personal Email address</span>
                      <span className="text-slate-750 block mt-0.5 font-medium">{selectedClient.email || '[No email]'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">ID / Passport Number</span>
                      <span className="text-slate-750 block mt-0.5 uppercase">{selectedClient.idPassport || '[Not recorded]'}</span>
                    </div>
                  </>
                )}
                
                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Assigned Account rep</span>
                  <span className="text-slate-750 block mt-0.5 font-semibold text-primary">{selectedClient.assignedToName || 'Sales Rep'}</span>
                </div>
              </div>
            </div>

            {/* Client Notes / remarks Display */}
            <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-1.5 duration-200">
              <span className="text-[10px] font-bold text-slate-450 uppercase block">Client History & Custom Remarks</span>
              <p className="text-xs text-slate-600 font-sans leading-relaxed whitespace-pre-line">
                {selectedClient.notes || 'No active guest remarks logged. Update profile card to commit some.'}
              </p>
            </div>

            {/* SECTION: NEGOTIATED OVERRIDES (Corporate ONLY - Super Admin Only) */}
            {selectedClient.type === 'corporate' && (
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-primary" />
                    <span>Special Negotiated Corporate Rates (KES)</span>
                  </h4>
                  <span className="text-[9px] text-[#993C1D] bg-red-100/50 rounded px-1.5 font-bold">Admin pricing locking</span>
                </div>

                {/* Form to add special rates if Super Admin */}
                {userProfile?.role === 'Super Admin' && (
                  <div className="bg-orange-50/20 border border-orange-100/30 rounded-xl p-3 flex flex-col sm:flex-row gap-2.5 text-xs">
                    <input 
                      type="text" 
                      placeholder="Pricing unit key (e.g. Conference PP, Superior Room HB)"
                      value={tempOverrideKey}
                      onChange={(e) => setTempOverrideKey(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 p-2 rounded-lg outline-none"
                    />
                    <input 
                      type="number" 
                      placeholder="Negotiated Price (KES)"
                      value={tempOverrideVal}
                      onChange={(e) => setTempOverrideVal(e.target.value)}
                      className="w-full sm:w-36 bg-white border border-slate-200 p-2 rounded-lg outline-none"
                    />
                    <button
                      onClick={handleAddNegotiatedRate}
                      className="bg-primary hover:bg-secondary text-white font-bold py-1.5 px-3 rounded-lg text-[10px] uppercase cursor-pointer shrink-0"
                    >
                      Save Override
                    </button>
                  </div>
                )}

                {/* Listing locked rates */}
                <div className="space-y-1.5">
                  {(!selectedClient.negotiatedRates || Object.keys(selectedClient.negotiatedRates || {}).length === 0) ? (
                    <p className="text-[10px] text-slate-400 italic">No negotiated rate overrides associated for this organization yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 divide-y divide-slate-100 border border-slate-100 rounded-xl bg-white p-3 font-sans">
                      {Object.entries(selectedClient.negotiatedRates || {}).map(([key, value]) => (
                        <div key={key} className="py-2.5 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-700 block">{key}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-extrabold text-[#993C1D]">KES {value.toLocaleString()}</span>
                            {userProfile?.role === 'Super Admin' && (
                              <button 
                                onClick={() => handleRemoveNegotiatedRate(key)}
                                className="text-slate-400 hover:text-red-600 p-1"
                                title="Delete Override"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Safeguard delete */}
            {isManagement && (
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleDeleteClient(selectedClient.clientId)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Customer Card</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
