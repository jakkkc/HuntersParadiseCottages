import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, where, onSnapshot, doc, 
  addDoc, updateDoc, deleteDoc, getDoc 
} from 'firebase/firestore';
import { Booking, ClientProfile, UserProfile, maskUserRole } from '../types';
import { 
  Calendar, CheckCircle, Clock, Plus, Search, 
  MapPin, Users, DollarSign, ArrowRightLeft, 
  FileCheck2, Trash2, ShieldAlert, RefreshCw, Send, Tag
} from 'lucide-react';
import { createGoogleCalendarEvent, formatBookingEvent } from '../utils/calendar';

const BOOKING_CATEGORIES = [
  'Room Accommodation', 
  'Conference Package', 
  'Corporate Dinner', 
  'Day Pass', 
  'Custom Event'
] as const;

export default function Bookings() {
  const { userProfile, googleToken } = { ...useAuth() };
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<'All' | 'Cottages' | 'Tuuti'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State Trigger
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Form State
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [branch, setBranch] = useState<'Cottages' | 'Tuuti'>('Cottages');
  const [category, setCategory] = useState<typeof BOOKING_CATEGORIES[number]>('Room Accommodation');
  const [guestsCount, setGuestsCount] = useState(1);
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [agreedPrice, setAgreedPrice] = useState(12000);
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [syncToCalendar, setSyncToCalendar] = useState(false);

  const isManagement = userProfile?.role === 'Super Admin' || userProfile?.role === 'Senior Manager';

  // Load Bookings, Clients, Sales employees
  useEffect(() => {
    if (!userProfile) return;

    let bQuery = collection(db, 'bookings');
    if (!isManagement) {
      bQuery = query(collection(db, 'bookings'), where('assignedTo', '==', userProfile.userId)) as any;
    }

    const unsubscribeBookings = onSnapshot(bQuery, (snapshot) => {
      const list: Booking[] = [];
      snapshot.forEach(doc => {
        list.push({ bookingId: doc.id, ...doc.data() } as Booking);
      });
      // Sort bookings by check-in date
      list.sort((a, b) => new Date(a.checkInDate).getTime() - new Date(b.checkInDate).getTime());
      setBookings(list);
      setLoading(false);
    });

    // Populate clients manually
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

    // Feed team selectors
    const teamQuery = collection(db, 'users');
    const unsubscribeTeam = onSnapshot(teamQuery, (snapshot) => {
      const ulist: UserProfile[] = [];
      snapshot.forEach(doc => {
        ulist.push(doc.data() as UserProfile);
      });
      setEmployees(ulist);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeClients();
      unsubscribeTeam();
    };
  }, [userProfile, isManagement]);

  // Handle saving new booking occupancy specs
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId && !clientName) {
      alert("Please designate a target customer name or profile connection.");
      return;
    }

    try {
      const representative = employees.find(emp => emp.userId === (assignedTo || userProfile?.userId)) || userProfile;
      const clientObj = clients.find(c => c.clientId === clientId);
      const finalClientName = clientObj ? (clientObj.companyName || clientObj.fullName) : clientName;

      // Create main booking doc
      const bookingPayload = {
        clientId: clientId || 'direct_guest',
        clientName: finalClientName,
        branch,
        category,
        guestsCount: Number(guestsCount),
        checkInDate,
        checkOutDate,
        agreedPrice: Number(agreedPrice),
        status: 'Active' as const,
        notes,
        assignedTo: representative?.userId || '',
        assignedToName: representative?.name || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'bookings'), bookingPayload);
      const generatedBookingId = docRef.id;
      await updateDoc(doc(db, 'bookings', generatedBookingId), { bookingId: generatedBookingId });

      // Automatically post two in_app_reminders (one for check-in day, one for checkout day!)
      // This matches the notification bell mandate dynamically
      await addDoc(collection(db, 'in_app_reminders'), {
        title: `HPC [${branch}] Arrival: ${finalClientName}`,
        description: `Scheduled arrival check-in for ${guestsCount} pax inside class ${category}.`,
        date: new Date(checkInDate).toISOString(),
        userId: representative?.userId || '',
        read: false,
        refId: generatedBookingId,
        refType: 'booking',
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'in_app_reminders'), {
        title: `HPC [${branch}] Checkout: ${finalClientName}`,
        description: `Scheduled check-out occupancy audit for category ${category}.`,
        date: new Date(checkOutDate).toISOString(),
        userId: representative?.userId || '',
        read: false,
        refId: generatedBookingId,
        refType: 'booking',
        createdAt: new Date().toISOString()
      });

      // Sync To Google Calendar if checked & user token exists
      if (syncToCalendar && googleToken) {
        // Sync arrival
        const checkInEvent = formatBookingEvent('Check-in', finalClientName, branch, category, checkInDate);
        await createGoogleCalendarEvent(googleToken, checkInEvent);

        // Sync departure
        const checkOutEvent = formatBookingEvent('Check-out', finalClientName, branch, category, checkOutDate);
        await createGoogleCalendarEvent(googleToken, checkOutEvent);
        
        alert("Booking details successfully scheduled and pushed to your Google Calendar!");
      }

      // Add audit log
      await addDoc(collection(db, 'activity_logs'), {
        refId: generatedBookingId,
        type: 'deal',
        action: `Booked occupancy schedule: ${category} for ${finalClientName} @ ${branch}`,
        performedBy: userProfile?.email || 'Sales Advisor',
        performedByName: userProfile?.name || 'CRM Agent',
        timestamp: new Date().toISOString()
      });

      // Reset
      setClientId('');
      setClientName('');
      setCheckInDate('');
      setCheckOutDate('');
      setNotes('');
      setSyncToCalendar(false);
      setIsCreateOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (bookingId: string, nextStatus: 'Active' | 'Completed' | 'Cancelled') => {
    try {
      const ref = doc(db, 'bookings', bookingId);
      await updateDoc(ref, { status: nextStatus, updatedAt: new Date().toISOString() });
      if (selectedBooking && selectedBooking.bookingId === bookingId) {
        setSelectedBooking({ ...selectedBooking, status: nextStatus });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    const confirmDelete = window.confirm("Are you positive you wish to completely wipe this occupancy booking? Check ins reminders remain.");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'bookings', bookingId));
      setSelectedBooking(null);
    } catch (e) {
      console.error(e);
    }
  };

  const formatKES = (val: number) => {
    return 'KES ' + val.toLocaleString('en-KE');
  };

  // Filtration logic
  const filteredBookings = bookings.filter(b => {
    const matchesSearch = b.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBranch = branchFilter === 'All' ? true : b.branch === branchFilter;
    return matchesSearch && matchesBranch;
  });

  return (
    <div className="space-y-6 px-1 font-sans" id="occupancy-bookings-root">
      
      {/* Top action layout */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" id="bookings-upper-panel">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
            <Calendar className="text-primary w-5.5 h-5.5" />
            Branch Occupancy & Conference Scheduler
          </h2>
          <p className="text-xs text-slate-500">
            Log room reservations, schedule boardrooms conferences, and monitor overlaps.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="bg-primary hover:bg-secondary text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
          id="new-booking-allocation-button"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>New Reservation</span>
        </button>
      </div>

      {/* Grid Filter docks */}
      <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#D85A30] shadow-sm p-4 flex flex-col md:flex-row gap-4" id="bookings-filter-bar">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reservations by guest name, lodging category..."
            className="w-full bg-slate-50 border border-slate-200 outline-none text-xs p-2.5 pl-10 pr-4 rounded-xl focus:border-primary focus:bg-white"
          />
        </div>

        {/* Branch Segment selectors */}
        <div className="flex items-center gap-1.5 shrink-0" id="bookings-branch-filters">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Branch Segment:</span>
          {(['All', 'Cottages', 'Tuuti'] as const).map(b => (
            <button
              key={b}
              onClick={() => setBranchFilter(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${branchFilter === b ? 'bg-accent border-primary text-secondary shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-105'}`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Scheduler Listings Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-400 text-xs font-medium">Loading active reservations...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#993C1D] shadow-sm overflow-hidden" id="bookings-table-container">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left font-sans min-w-[750px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Reserved Patron</th>
                  <th className="py-3 px-4">HPC Branch</th>
                  <th className="py-3 px-4">Lodge Category</th>
                  <th className="py-3 px-4">Schedules check-in</th>
                  <th className="py-3 px-4">Schedules checkout</th>
                  <th className="py-3 px-4">Pax</th>
                  <th className="py-3 px-4">Total Revenue</th>
                  <th className="py-3 px-4">Allocation Status</th>
                  <th className="py-3 px-4 text-center">Scheduler Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.map((b) => (
                  <tr key={b.bookingId} className="hover:bg-slate-50/20 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800">{b.clientName}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${b.branch === 'Tuuti' ? 'bg-amber-100 text-[#993C1D]' : 'bg-orange-100 text-[#D85A30]'}`}>
                        {b.branch}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-600">
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-400" />
                        {b.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">{new Date(b.checkInDate).toLocaleDateString()}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">{new Date(b.checkOutDate).toLocaleDateString()}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-500">{b.guestsCount} Pax</td>
                    <td className="py-3.5 px-4 font-extrabold text-[#993C1D]">{formatKES(b.agreedPrice)}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${b.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : b.status === 'Completed' ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-600'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button 
                        onClick={() => setSelectedBooking(b)}
                        className="bg-[#FAECE7] text-[#D85A30] hover:bg-[#D85A30] hover:text-white px-3 py-1 text-[11px] font-bold rounded-lg transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredBookings.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400 font-medium">
                      No active schedules or lodging allocations matched your query bounds.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FORM MODAL: REGISTER RESERVATION */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto font-sans" id="booking-form-modal">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                <Calendar className="text-[#D85A30] w-5 h-5" />
                <span>Register Occupancy Reservation Allocate</span>
              </h3>
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold font-mono"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="space-y-4 text-xs">
              
              {/* Linked account selector */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Select Customer Account / Lead</label>
                <select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    if (e.target.value) setClientName('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl block outline-none"
                  id="booking-account-selector"
                >
                  <option value="">-- [None] - Guest Direct Walk-in --</option>
                  {clients.map(c => (
                    <option key={c.clientId} value={c.clientId}>
                      {c.type === 'corporate' ? `${c.companyName} (Company)` : `${c.fullName} (Guest)`}
                    </option>
                  ))}
                </select>
              </div>

              {!clientId && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1 font-sans">Walk-in Customer Name</label>
                  <input 
                    type="text" required
                    placeholder="Provide full name prefix details..."
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Branch Station</label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  >
                    <option value="Cottages">Hunters Paradise Cottages</option>
                    <option value="Tuuti">Hunters Paradise Tuuti</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Service category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  >
                    {BOOKING_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Headcount (Guests Quantity)</label>
                  <input 
                    type="number" required
                    value={guestsCount}
                    onChange={(e) => setGuestsCount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Agreed Reservation Price (KES)</label>
                  <input 
                    type="number" required
                    value={agreedPrice}
                    onChange={(e) => setAgreedPrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Official Arrival / Check-in</label>
                  <input 
                    type="date" required
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Official Departure / Check-out</label>
                  <input 
                    type="date" required
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none font-sans"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sales Advisor in Charge</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl outline-none"
                  >
                    <option value="">-- Assigned To Me --</option>
                    {employees.map(emp => (
                      <option key={emp.userId} value={emp.userId}>{emp.name} ({maskUserRole(emp.role)})</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-4 pl-1">
                  <input 
                    type="checkbox" 
                    id="auto-sync-reminders-google"
                    checked={syncToCalendar}
                    onChange={(e) => {
                      if (e.target.checked && !googleToken) {
                        alert("Google Calendar is not authorized. Please link your calendar via the header dropdown bell first.");
                        return;
                      }
                      setSyncToCalendar(e.target.checked);
                    }}
                    className="accent-primary h-4 w-4 rounded-md"
                  />
                  <label htmlFor="auto-sync-reminders-google" className="text-[10.5px] text-slate-500 font-bold select-none cursor-pointer">
                    Sync to Google Calendar
                  </label>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Special Meal plan, cottage allocations, or conference items specs</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Bed & Breakfast; Cottage #4; Conference Hall setup with projectors..."
                  className="w-full bg-slate-50 border border-slate-200 outline-none p-2.5 rounded-xl h-16 block text-[11px] font-sans"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-[#D85A30] hover:bg-[#993C1D] text-white py-3 rounded-xl font-bold font-sans shadow-md cursor-pointer text-center duration-150 uppercase tracking-widest"
              >
                Schedule Reservation Allocation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR DETAIL INSPECTOR: BOOKING RESOLUTION */}
      {selectedBooking && (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l border-slate-100 shadow-2xl z-50 flex flex-col font-sans" id="booking-detail-inspector">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
            <div>
              <span className="text-[9px] text-[#993C1D] bg-red-100 font-bold px-2 py-0.5 rounded-lg uppercase">
                ID Reference: {selectedBooking.bookingId.substring(0, 8)}
              </span>
              <h3 className="font-extrabold text-slate-800 text-sm mt-1">{selectedBooking.clientName}</h3>
            </div>
            <button 
              onClick={() => setSelectedBooking(null)}
              className="text-slate-400 hover:text-slate-600 text-xl font-bold font-mono h-8 w-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center cursor-pointer shadow-xs"
            >
              &times;
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5" id="booking-inspector-scroll">
            <div className="space-y-4 text-xs text-slate-600">
              
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Branch Assignment Location</span>
                <span className="text-sm font-extrabold text-slate-800 block mt-0.5">{selectedBooking.branch} Branch Station</span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">lodging & conference category</span>
                <span className="text-sm font-bold text-primary block mt-0.5">{selectedBooking.category}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-b border-slate-100 py-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Check-in Scheduled</span>
                  <strong className="text-slate-800 block mt-0.5 font-semibold text-xs">{new Date(selectedBooking.checkInDate).toLocaleDateString()}</strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Check-out Scheduled</span>
                  <strong className="text-slate-800 block mt-0.5 font-semibold text-xs">{new Date(selectedBooking.checkOutDate).toLocaleDateString()}</strong>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Agreed Revenue Tariff</span>
                <span className="text-lg font-black text-[#993C1D] block mt-0.5">{formatKES(selectedBooking.agreedPrice)}</span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Assigned Advisor Representative</span>
                <span className="text-slate-700 block mt-0.5 font-medium">{selectedBooking.assignedToName}</span>
              </div>

              <div className="bg-slate-50 border border-slate-150 p-3 rounded-lg block">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Internal Allocation Note</span>
                <p className="text-slate-650 font-sans leading-relaxed mt-1">{selectedBooking.notes || 'No custom notes logged.'}</p>
              </div>

              {/* Status Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Transition Allocation Status</span>
                <div className="grid grid-cols-3 gap-1.5" id="booking-transition-actions">
                  {(['Active', 'Completed', 'Cancelled'] as const).map(st => (
                    <button
                      key={st}
                      onClick={() => handleUpdateStatus(selectedBooking.bookingId, st)}
                      className={`p-2 rounded-lg text-[10px] font-bold border transition-all truncate ${selectedBooking.status === st ? 'bg-primary border-primary text-white shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* General Delete */}
            {isManagement && (
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => handleDeleteBooking(selectedBooking.bookingId)}
                  className="bg-red-50 hover:bg-red-100 text-red-650 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer font-sans"
                >
                  <Trash2 className="w-4 h-4 text-red-650" />
                  <span>Wipe Reservation</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
