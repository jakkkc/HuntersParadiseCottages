import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, where, onSnapshot, doc, 
  setDoc, updateDoc, getDoc 
} from 'firebase/firestore';
import { MonthlyTarget, UserProfile } from '../types';
import { 
  Target, Users, Award, DollarSign, Calendar, Edit, 
  Settings, CheckCircle2, TrendingUp, Sparkles, Building
} from 'lucide-react';

export default function Targets() {
  const { userProfile } = useAuth();
  const [targets, setTargets] = useState<MonthlyTarget[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Filtering settings
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const monthsList = [
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' },
  ];

  const yearsList = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];

  const isManagement = userProfile?.role === 'Super Admin' || userProfile?.role === 'Senior Manager';

  // Load target quotas & team list
  useEffect(() => {
    if (!userProfile) return;

    setLoading(true);

    // Read full directories if management, otherwise filter by own userID
    let tQuery = collection(db, 'targets');
    if (!isManagement) {
      tQuery = query(collection(db, 'targets'), where('userId', '==', userProfile.userId)) as any;
    }

    const unsubscribeTargets = onSnapshot(tQuery, (snapshot) => {
      const list: MonthlyTarget[] = [];
      snapshot.forEach(doc => {
        list.push({ targetId: doc.id, ...doc.data() } as MonthlyTarget);
      });
      setTargets(list);
    });

    // Load available manual sales list if management
    const eQuery = collection(db, 'users');
    const unsubscribeEmployees = onSnapshot(eQuery, (snapshot) => {
      const elist: UserProfile[] = [];
      snapshot.forEach(doc => {
        const d = doc.data() as UserProfile;
        // Include only Sales Executives or active reps in quotas settings
        elist.push(d);
      });
      setEmployees(elist);
      setLoading(false);
    });

    return () => {
      unsubscribeTargets();
      unsubscribeEmployees();
    };
  }, [userProfile, isManagement]);

  const handleEditClick = (targetId: string, value: number) => {
    setEditingTargetId(targetId);
    setEditingValue(String(value));
  };

  // Update target in Firestore
  const handleSaveTarget = async (repId: string) => {
    if (!editingValue || isNaN(Number(editingValue))) {
      alert("Provide a valid integer target number.");
      return;
    }

    try {
      const targetId = `${repId}_${selectedYear}_${selectedMonth}`;
      const targetRef = doc(db, 'targets', targetId);
      const targetSnap = await getDoc(targetRef);

      const matchedEmp = employees.find(e => e.userId === repId);

      const payload = {
        targetValue: Number(editingValue),
        updatedAt: new Date().toISOString()
      };

      if (targetSnap.exists()) {
        await updateDoc(targetRef, payload);
      } else {
        // Create new targets document
        await setDoc(targetRef, {
          targetId,
          userId: repId,
          userEmail: matchedEmp?.email || '',
          userName: matchedEmp?.name || 'Sales Rep',
          month: selectedMonth,
          year: selectedYear,
          targetValue: Number(editingValue),
          actualRevenue: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      setEditingTargetId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const formatKES = (val: number) => {
    return 'KES ' + val.toLocaleString('en-KE');
  };

  return (
    <div className="space-y-6 px-1 font-sans" id="target-control-root">
      
      {/* Top action block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-none" id="targets-header-panel">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Target className="text-primary w-5.5 h-5.5" />
            Monthly Targets & Sales Quotas Cockpit
          </h2>
          <p className="text-xs text-slate-500">
            {isManagement ? 'Model monthly targets for sales representatives and track overall performance.' : 'Monitor your personal monthly target guidelines.'}
          </p>
        </div>

        {/* Date Filters selectors */}
        <div className="flex items-center gap-2" id="targets-date-selectors">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-white border border-slate-200 text-xs p-2.5 rounded-xl outline-none text-slate-700 font-semibold"
          >
            {monthsList.map(m => (
              <option key={m.value} value={m.value}>{m.name}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-white border border-slate-200 text-xs p-2.5 rounded-xl outline-none text-slate-705 font-semibold"
          >
            {yearsList.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-xs text-slate-400 font-medium">Loading target matrices...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4" id="targets-overview-grid">
          
          {/* Main Targets comparison card sheet */}
          <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#993C1D] p-6 space-y-5" id="targets-matrix-card">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Users className="w-4.5 h-4.5 text-primary" />
                <span>
                  Quota Matrix: {monthsList.find(m => m.value === selectedMonth)?.name} {selectedYear} Campaign
                </span>
              </h3>
              <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded font-mono font-bold">Interactive CRM Setting</span>
            </div>

            {/* List representatives with their targets */}
            <div className="space-y-4" id="target-employee-rows-scroller">
              {employees.map(emp => {
                const targetKey = `${emp.userId}_${selectedYear}_${selectedMonth}`;
                const associatedTarget = targets.find(t => t.targetId === targetKey);
                
                const targetVal = associatedTarget ? associatedTarget.targetValue : 0;
                const actualRevenue = associatedTarget ? associatedTarget.actualRevenue : 0;
                
                const achievedPercent = targetVal > 0 
                  ? Math.round((actualRevenue / targetVal) * 100)
                  : 0;

                const isRowEditing = editingTargetId === targetKey;

                // Restrict editing controls to management (Super Admin / Senior Manager)
                // Sales reps can read only!
                const canModify = isManagement;

                return (
                  <div 
                    key={emp.userId} 
                    className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-5 transition-shadow hover:shadow-xs"
                  >
                    
                    {/* Representative details */}
                    <div className="flex items-center gap-3 w-full lg:w-72 shrink-0">
                      <div className="p-2.5 bg-accent text-[#D85A30] rounded-xl font-bold">
                        {emp.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <strong className="text-xs text-slate-800 block font-bold leading-snug">{emp.name}</strong>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{emp.email} • <span className="text-primary font-bold">{emp.role}</span></span>
                      </div>
                    </div>

                    {/* Target editing or Display block */}
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 items-center">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Assigned target (KES)</span>
                        {isRowEditing ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <input 
                              type="number"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              className="w-28 bg-white border border-slate-200 p-1.5 rounded-lg text-xs outline-none focus:border-primary"
                              placeholder="e.g. 500000"
                            />
                            <button
                              onClick={() => handleSaveTarget(emp.userId)}
                              className="bg-primary text-white p-1.5 rounded-lg text-xs font-bold cursor-pointer hover:bg-secondary transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingTargetId(null)}
                              className="text-xs text-slate-400 text-center px-1"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-1">
                            <strong className="text-xs text-slate-700">{targetVal > 0 ? formatKES(targetVal) : 'No Target Set'}</strong>
                            {canModify && (
                              <button 
                                onClick={() => handleEditClick(targetKey, targetVal)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-[#D85A30]"
                                title="Edit target quota"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Confirmed Revenue (KES)</span>
                        <strong className="text-xs text-primary block mt-1">{formatKES(actualRevenue)}</strong>
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Quota Progress Rate</span>
                        <div className="flex items-center gap-2 mt-1">
                          <strong className="text-xs text-[#993C1D]">{achievedPercent}%</strong>
                          {achievedPercent >= 100 && (
                            <span className="px-2 py-0.5 text-[9px] bg-green-50 text-green-700 font-bold border border-green-200 rounded-full flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3 text-green-600" />
                              Achieved
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar representation */}
                    <div className="w-full lg:w-48 shrink-0 space-y-1">
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-primary to-secondary h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(achievedPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 block text-right font-semibold">{Math.min(achievedPercent, 100)}% progress</span>
                    </div>

                  </div>
                );
              })}

              {employees.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-xs">No active sales representatives listed in your corporate registry database.</div>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
