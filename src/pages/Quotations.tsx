import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, where, onSnapshot, doc, 
  addDoc, updateDoc, deleteDoc, getDocs 
} from 'firebase/firestore';
import { Quotation, ClientProfile, RateCard, QuotationItem } from '../types';
import { 
  FileText, Plus, Search, MapPin, Tag, Download, Trash2, 
  Layers, CheckSquare, Edit, Milestone, AlertTriangle, ListPlus
} from 'lucide-react';
import { generateQuotationPDF } from '../components/QuotationPDF';

const QUOTE_STATUS_OPTIONS = ['Draft', 'Sent', 'Accepted', 'Rejected'] as const;

export default function Quotations() {
  const { userProfile } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [rates, setRates] = useState<RateCard[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<'All' | 'Cottages' | 'Tuuti'>('All');

  // Trigger Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  // Form State: Quotation Core
  const [clientId, setClientId] = useState('');
  const [branch, setBranch] = useState<'Cottages' | 'Tuuti'>('Cottages');
  const [validityPeriod, setValidityPeriod] = useState(14);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [customTerms, setCustomTerms] = useState(
    "1. Standard check in: 12:00 PM, Check out: 10:00 AM.\n2. Invoices are inclusive of statutory V.A.T.\n3. Deposit of 50% is required to secure any conference bookings.\n4. Negotiated rates are tailored for the specified company only."
  );

  // Itemized Line Adder State
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [itemCategory, setItemCategory] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemRackRate, setItemRackRate] = useState(0);
  const [itemNegRate, setItemNegRate] = useState(0);
  const [itemQty, setItemQty] = useState(1);
  const [itemDays, setItemDays] = useState(1);

  const isManagement = userProfile?.role === 'Super Admin' || userProfile?.role === 'Senior Manager';

  // Load Quotations, Clients, dynamically seeded Rate Cards
  useEffect(() => {
    if (!userProfile) return;

    let qQuery = collection(db, 'quotations');
    if (!isManagement) {
      qQuery = query(collection(db, 'quotations'), where('createdBy', '==', userProfile.userId)) as any;
    }

    const unsubscribeQuotes = onSnapshot(qQuery, (snapshot) => {
      const list: Quotation[] = [];
      snapshot.forEach(doc => {
        list.push({ quotationId: doc.id, ...doc.data() } as Quotation);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setQuotations(list);
      setLoading(false);
    });

    // Match Client Profiles
    let cQuery = collection(db, 'clients');
    if (!isManagement) {
      cQuery = query(collection(db, 'clients'), where('assignedTo', '==', userProfile.userId)) as any;
    }
    const unsubscribeClients = onSnapshot(cQuery, (snapshot) => {
      const clist: ClientProfile[] = [];
      snapshot.forEach(doc => {
        clist.push({ clientId: doc.id, ...doc.data() } as ClientProfile);
      });
      setClients(clist);
    });

    // Retrieve global rate cards
    const unsubscribeRates = onSnapshot(collection(db, 'rates'), (snapshot) => {
      const rlist: RateCard[] = [];
      snapshot.forEach(doc => {
        rlist.push(doc.data() as RateCard);
      });
      setRates(rlist);
    });

    return () => {
      unsubscribeQuotes();
      unsubscribeClients();
      unsubscribeRates();
    };
  }, [userProfile, isManagement]);

  // Retrieve special client custom rates if available when selecting a category inside Quotation drafting
  const handleCategorySelection = (catKey: string) => {
    const matchedRate = rates.find(r => r.key === catKey && r.branch === branch);
    const matchedClient = clients.find(c => c.clientId === clientId);
    
    let baseRack = matchedRate ? matchedRate.rackRate : 0;
    let negPrice = baseRack;

    // Check if client profile has active Super Admin special negotiated overrides for this key!
    if (matchedClient?.negotiatedRates && matchedClient.negotiatedRates[catKey]) {
      negPrice = matchedClient.negotiatedRates[catKey];
    }

    setItemCategory(catKey);
    setItemDesc(matchedRate ? matchedRate.description : '');
    setItemRackRate(baseRack);
    setItemNegRate(negPrice);
  };

  // Add line item onto active build list
  const handleAddLineItem = () => {
    if (!itemCategory || itemNegRate <= 0) {
      alert("Please designate a Category and specify Negotiated Pricing");
      return;
    }

    // Days multiplier applies if Accommodation or Conference days are specified
    const calculatedSub = itemNegRate * itemQty * (itemDays || 1);

    const newItem: QuotationItem = {
      id: String(Date.now()),
      category: itemCategory as any,
      description: itemDesc || itemCategory,
      originalRate: itemRackRate,
      negotiatedRate: itemNegRate,
      quantity: itemQty,
      days: itemDays || 1,
      subtotal: calculatedSub
    };

    setItems([...items, newItem]);
    
    // Reset Adder form
    setItemCategory('');
    setItemDesc('');
    setItemRackRate(0);
    setItemNegRate(0);
    setItemQty(1);
    setItemDays(1);
  };

  // Delete line item
  const handleRemoveLineItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  // Calculate Subtotals & Grand totals dynamically
  const quotationSubtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
  const quotationGrandTotal = Math.max(0, quotationSubtotal - discountAmount);

  // Submit Quote to Firebase
  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert("Please compound at least one item line to publish the proposal.");
      return;
    }
    if (!clientId) {
      alert("Assigning a customer account profile is required.");
      return;
    }

    try {
      const clientObj = clients.find(c => c.clientId === clientId);
      const clientName = clientObj ? (clientObj.companyName || clientObj.fullName) : 'Enterprise Account';

      // Generate a dynamic Quotation code inside format HPC-YYYY-MM-Random digit
      const randomSeq = Math.floor(100 + Math.random() * 900);
      const docCode = `HPC/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${randomSeq}`;

      const payload = {
        quoteNumber: docCode,
        clientId,
        clientName,
        clientEmail: clientObj?.email || clientObj?.primaryContact?.email || '',
        clientPhone: clientObj?.phone || clientObj?.primaryContact?.phone || '',
        companyName: clientObj?.companyName || '',
        branch,
        items,
        subtotal: quotationSubtotal,
        discount: Number(discountAmount),
        total: quotationGrandTotal,
        status: 'Draft' as const,
        validityPeriod: Number(validityPeriod),
        terms: customTerms,
        createdBy: userProfile?.userId || '',
        createdByName: userProfile?.name || 'Sales Representative',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'quotations'), payload);
      await updateDoc(doc(db, 'quotations', docRef.id), { quotationId: docRef.id });

      // Add log
      await addDoc(collection(db, 'activity_logs'), {
        refId: docRef.id,
        type: 'deal',
        action: `Created itemized Quotation proposal ${docCode} for ${clientName}`,
        performedBy: userProfile?.email || 'Sales rep',
        performedByName: userProfile?.name || 'CRM Advisor',
        timestamp: new Date().toISOString()
      });

      // Clear builders
      setItems([]);
      setClientId('');
      setDiscountAmount(0);
      setIsCreateOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (quoteId: string, nextStatus: typeof QUOTE_STATUS_OPTIONS[number]) => {
    try {
      const ref = doc(db, 'quotations', quoteId);
      await updateDoc(ref, { status: nextStatus, updatedAt: new Date().toISOString() });
      if (selectedQuotation && selectedQuotation.quotationId === quoteId) {
        setSelectedQuotation({ ...selectedQuotation, status: nextStatus });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteQuotation = async (quoteId: string) => {
    const confirmDelete = window.confirm("Are you positive you wish to completely delete this Quotation record? PDFs can still be generated.");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'quotations', quoteId));
      setSelectedQuotation(null);
    } catch (e) {
      console.error(e);
    }
  };

  const formatKES = (val: number) => {
    return 'KES ' + val.toLocaleString('en-KE');
  };

  const filteredQuotes = quotations.filter(q => {
    const matchesSearch = q.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          q.quoteNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBranch = branchFilter === 'All' ? true : q.branch === branchFilter;
    return matchesSearch && matchesBranch;
  });

  return (
    <div className="space-y-6 px-1 font-sans" id="proposal-quotations-root">
      
      {/* Upper layouts Actions panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" id="quotations-upper-panel">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
            <FileText className="text-primary w-5.5 h-5.5" />
            Corporate quotations Proposal Center
          </h2>
          <p className="text-xs text-slate-500">
            Auto-fetch standard rate cards, apply client overrides, and draft downloadable PDFs.
          </p>
        </div>

        <button
          onClick={() => { setItems([]); setIsCreateOpen(true); }}
          className="bg-primary hover:bg-secondary text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
          id="draft-proposal-quota-button"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>Draft Quotation</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#D85A30] shadow-sm p-4 flex flex-col md:flex-row gap-4" id="quotations-filter-bar">
        <div className="relative flex-1 text-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search quotations by quote reference number, company metadata..."
            className="w-full bg-slate-50 border border-slate-200 outline-none text-xs p-3 pl-10 pr-4 rounded-xl focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Branch selectors */}
        <div className="flex items-center gap-1.5 shrink-0" id="quotations-branch-filters">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Branch Focus:</span>
          {(['All', 'Cottages', 'Tuuti'] as const).map(b => (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${branchFilter === b ? 'bg-accent border-primary text-secondary' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* List display */}
      {loading ? (
        <div className="text-center py-20 text-slate-400 text-xs font-medium">Loading quotations logs...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#993C1D] shadow-sm overflow-hidden" id="quotations-table-container">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left font-sans min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Ref Code</th>
                  <th className="py-3 px-3">Corporate Client Account</th>
                  <th className="py-3 px-3">HPC Branch</th>
                  <th className="py-3 px-3">Subtotal (KES)</th>
                  <th className="py-3 px-3">Grand Total (KES)</th>
                  <th className="py-3 px-3">Validity Days</th>
                  <th className="py-3 px-3">Deal status</th>
                  <th className="py-3 px-3">Author</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuotes.map((q) => (
                  <tr key={q.quotationId} className="hover:bg-slate-50/20 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800">{q.quoteNumber}</td>
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-slate-800 block">{q.clientName}</span>
                      <span className="text-[10px] text-slate-400">{q.companyName || 'Guest walkin'}</span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${q.branch === 'Tuuti' ? 'bg-amber-100 text-[#993C1D]' : 'bg-orange-100 text-[#D85A30]'}`}>
                        {q.branch}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-500">{formatKES(q.subtotal)}</td>
                    <td className="py-3.5 px-3 font-extrabold text-[#993C1D]">{formatKES(q.total)}</td>
                    <td className="py-3.5 px-3 font-medium text-slate-650">{q.validityPeriod} Days</td>
                    <td className="py-3.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${q.status === 'Accepted' ? 'bg-green-50 text-green-600 border border-green-100' : q.status === 'Rejected' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-500">{q.createdByName}</td>
                    <td className="py-3.5 px-4 flex items-center justify-center gap-1">
                      <button 
                        onClick={() => setSelectedQuotation(q)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-[10.5px] transition-colors"
                      >
                        Inspect
                      </button>
                      
                      <button 
                        onClick={() => generateQuotationPDF(q)}
                        className="bg-[#FAECE7] hover:bg-[#D85A30] hover:text-white text-[#D85A30] font-bold p-1.5 rounded-lg transition-colors flex items-center justify-center"
                        title="Download quotation as PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredQuotes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400 font-medium">
                      No active quote proposals matched your search parameters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FORM MODAL: CREATE ITEMISED CORPORATE QUOTATION */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto font-sans text-xs" id="quotation-form-modal">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                <FileText className="text-[#D85A30] w-5 h-5" />
                <span>Compile Corporate Quotation Proposal</span>
              </h3>
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-mono font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveQuotation} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Linked profile */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Target Client Account Profile</label>
                  <select
                    value={clientId}
                    selected={clientId}
                    required
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none text-xs block"
                    id="quotations-builder-client"
                  >
                    <option value="">-- [Select client account] --</option>
                    {clients.map(c => (
                      <option key={c.clientId} value={c.clientId}>
                        {c.type === 'corporate' ? `${c.companyName} (Company)` : `${c.fullName} (Guest)`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Branch Location */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Station Branch</label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none text-xs"
                  >
                    <option value="Cottages">Hunters Paradise Cottages</option>
                    <option value="Tuuti">Hunters Paradise Tuuti</option>
                  </select>
                </div>
              </div>

              {/* DYNAMIC RATE CARD INTEGRATION & OVERRIDES PANEL */}
              <div className="border border-slate-150 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <ListPlus className="w-4 h-4 text-primary" />
                  <span>Compound item lines (Stock rate card integrated)</span>
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  
                  {/* Category select */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Lodging/Service Category Selector</label>
                    <select
                      value={itemCategory}
                      onChange={(e) => handleCategorySelection(e.target.value)}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg outline-none text-[11px]"
                    >
                      <option value="">-- Choose Segment --</option>
                      {rates.filter(r => r.branch === branch).map(r => (
                        <option key={r.key} value={r.key}>{r.key}</option>
                      ))}
                    </select>
                  </div>

                  {/* Rack rate display */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Stock Rack Rate (Auto KES)</label>
                    <input 
                      type="text" 
                      readOnly
                      disabled
                      value={itemRackRate > 0 ? formatKES(itemRackRate) : ''}
                      placeholder="Stock Rack Rate"
                      className="w-full bg-slate-100 text-slate-500 border border-slate-200 p-2 rounded-lg outline-none cursor-not-allowed"
                    />
                  </div>

                  {/* Negotiated rates custom override */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Custom Negotiated Price (KES)</label>
                    <input 
                      type="number"
                      placeholder="Pricing unit custom override"
                      value={itemNegRate}
                      onChange={(e) => setItemNegRate(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg outline-none font-bold text-[#993C1D]"
                    />
                  </div>

                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Line Item custom specifications</label>
                    <input 
                      type="text"
                      placeholder="Short spec/note e.g., VIP dinner setup, Deluxe double bed"
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Quantity / Guests</label>
                    <input 
                      type="number"
                      value={itemQty}
                      onChange={(e) => setItemQty(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Operational Days (Length)</label>
                    <input 
                      type="number"
                      value={itemDays}
                      onChange={(e) => setItemDays(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Insert Quotation Line</span>
                  </button>
                </div>
              </div>

              {/* TABLE: COMPILING ITEM LINES LIST */}
              <div className="border border-slate-100 rounded-xl overflow-hidden mt-3">
                <table className="w-full text-xs text-left" id="quotations-builder-list-table">
                  <thead>
                    <tr className="bg-slate-150 text-slate-500 border-b border-dashed border-slate-200 font-semibold uppercase">
                      <th className="py-2.5 px-3">Service Code</th>
                      <th className="py-2.5 px-3">Specs description</th>
                      <th className="py-2.5 px-3">Rack Rate KES</th>
                      <th className="py-2.5 px-3 border-l border-orange-100">Price Quote</th>
                      <th className="py-2.5 px-3">Qty / Days</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 text-center">Wipe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, index) => (
                      <tr key={index} className="hover:bg-slate-50/10 transition-colors">
                        <td className="py-2 px-3 font-bold text-slate-700">{it.category}</td>
                        <td className="py-2 px-3 text-slate-500 max-w-[150px] truncate">{it.description}</td>
                        <td className="py-2 px-3 text-slate-500 line-through">{formatKES(it.originalRate)}</td>
                        <td className="py-2 px-3 font-extrabold text-[#993C1D] shadow-xs bg-orange-50/10 border-l border-orange-100">{formatKES(it.negotiatedRate)}</td>
                        <td className="py-2 px-3 font-semibold text-slate-500">{it.quantity} Pax x {it.days} Days</td>
                        <td className="py-2 px-3 text-right font-extrabold text-slate-800">{formatKES(it.subtotal)}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(index)}
                            className="text-red-500 hover:underline font-bold"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-400">Empty build list. Insert rate items above!</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* TOTALS & TERMS SET */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3.5 border-t border-slate-100 font-sans">
                
                {/* Terms conditions */}
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Contract terms policies</label>
                    <textarea 
                      value={customTerms}
                      onChange={(e) => setCustomTerms(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 h-24 text-[10.5px] font-sans text-slate-600 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Quotation Validity period (Days)</label>
                      <input 
                        type="number"
                        value={validityPeriod}
                        onChange={(e) => setValidityPeriod(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Global Discount override (KES)</label>
                      <input 
                        type="number"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl outline-none font-bold text-green-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Totals panel */}
                <div className="bg-slate-50 border border-slate-250 rounded-xl p-5 flex flex-col justify-between" id="quotation-totals-box">
                  <div className="space-y-3 font-sans">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Itemized Subtotal:</span>
                      <strong className="text-slate-800">{formatKES(quotationSubtotal)}</strong>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Corporate Campaign Discount:</span>
                      <strong className="text-green-700">- {formatKES(discountAmount)}</strong>
                    </div>
                    <div className="border-t border-slate-200 pt-3 flex justify-between items-center bg-white p-3.5 rounded-xl border">
                      <span className="text-xs font-bold text-slate-800">Grand Total KES:</span>
                      <strong className="text-[#993C1D] text-lg font-black">{formatKES(quotationGrandTotal)}</strong>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="mt-4 w-full bg-primary hover:bg-secondary text-white py-3.5 rounded-xl font-extrabold text-xs shadow-md shadow-orange-100 cursor-pointer text-center transition-colors uppercase tracking-widest"
                  >
                    Save Quotation Proposal
                  </button>
                </div>

              </div>

            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR DETAIL INSPECTOR: QUOTATION OVERVIEW */}
      {selectedQuotation && (
        <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white border-l border-slate-150 shadow-2xl z-50 flex flex-col font-sans" id="quotation-detail-inspector">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
            <div>
              <span className="text-[9px] text-[#993C1D] bg-red-100 font-bold px-2 py-0.5 rounded uppercase">
                Proposal Ref: {selectedQuotation.quoteNumber}
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm mt-1">{selectedQuotation.clientName}</h3>
            </div>
            <button 
              onClick={() => setSelectedQuotation(null)}
              className="text-slate-400 hover:text-slate-600 text-xl font-bold font-mono h-8 w-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center cursor-pointer shadow-xs"
            >
              &times;
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5" id="quotation-inspector-scroll">
            
            {/* Quick Export bar */}
            <div className="bg-[#FAECE7] border border-primary/20 rounded-xl p-4 flex justify-between items-center shrink-0">
              <div>
                <span className="text-[10px] font-bold text-[#993C1D] uppercase">Export and Print</span>
                <p className="text-xs text-slate-500 mt-0.5">Generate highly polished signature-ready client KES Quotation PDF.</p>
              </div>
              <button
                onClick={() => generateQuotationPDF(selectedQuotation)}
                className="bg-[#D85A30] text-white p-3.5 rounded-xl font-bold shadow hover:bg-secondary cursor-pointer transition-all flex items-center gap-1 text-xs"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-600">
              
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Branch Assigned Location</span>
                  <span className="text-xs font-bold text-slate-800 block mt-0.5">{selectedQuotation.branch}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Validity Interval</span>
                  <span className="text-xs font-semibold text-slate-700 block mt-0.5">{selectedQuotation.validityPeriod} Days Campaign</span>
                </div>
              </div>

              {/* Items listing recap */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Itemized services schedule breakdown</span>
                <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 bg-slate-50/50 p-2.5 space-y-1.5">
                  {selectedQuotation.items.map((it, i) => (
                    <div key={i} className="py-2.5 flex justify-between text-xs font-sans">
                      <div>
                        <span className="font-bold text-slate-800 block">{it.category}</span>
                        <span className="text-[10px] text-slate-400 italic block">{it.description}</span>
                        <span className="text-[10px] text-slate-500 block">Pricing: {it.quantity} Unit x {it.days} Days @ {formatKES(it.negotiatedRate)}</span>
                      </div>
                      <strong className="text-slate-800">{formatKES(it.subtotal)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sum totals */}
              <div className="bg-slate-50 border p-4 rounded-xl space-y-2 font-sans border-dashed border-slate-350">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Subtotal Revenue:</span>
                  <span className="font-bold text-slate-800">{formatKES(selectedQuotation.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium font-sans">Campaign Discounts:</span>
                  <span className="font-bold text-green-700">- {formatKES(selectedQuotation.discount)}</span>
                </div>
                <div className="border-t border-slate-250 pt-2 flex justify-between mt-1 text-sm font-semibold">
                  <span className="text-slate-800">Grand Total KES:</span>
                  <span className="font-black text-[#993C1D]">{formatKES(selectedQuotation.total)}</span>
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-150">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Advance Quotation Stage</span>
                <div className="grid grid-cols-4 gap-1.5" id="quotation-advance-actions">
                  {QUOTE_STATUS_OPTIONS.map(st => (
                    <button
                      key={st}
                      onClick={() => handleUpdateStatus(selectedQuotation.quotationId, st)}
                      className={`p-2 rounded-lg text-[10px] font-bold border transition-all truncate ${selectedQuotation.status === st ? 'bg-primary border-primary text-white shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-105'}`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* General Delete */}
            {isManagement && (
              <div className="pt-4 border-t border-slate-105 flex justify-end">
                <button
                  onClick={() => handleDeleteQuotation(selectedQuotation.quotationId)}
                  className="bg-red-50 hover:bg-red-100 text-red-650 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer font-sans"
                >
                  <Trash2 className="w-4 h-4 text-red-650" />
                  <span>Delete Quotation</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
