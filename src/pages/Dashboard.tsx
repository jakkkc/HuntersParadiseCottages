import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { PipelineDeal, MonthlyTarget, Booking } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  TrendingUp, Users, DollarSign, Award, Target, Landmark, 
  Layers, ShoppingCart, Calendar, ArrowUpRight, CheckCircle
} from 'lucide-react';

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [pipeline, setPipeline] = useState<PipelineDeal[]>([]);
  const [targets, setTargets] = useState<MonthlyTarget[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Derive current month and year
  const today = new Date();
  const currentMonthNum = today.getMonth() + 1; // 1-12
  const currentYearNum = today.getFullYear();

  const formatKES = (val: number) => {
    return 'KES ' + val.toLocaleString('en-KE');
  };

  const isManagement = userProfile?.role === 'Super Admin' || userProfile?.role === 'Senior Manager';

  useEffect(() => {
    if (!userProfile) return;

    setLoading(true);

    // Queries scoped by role
    let pipelineQuery = collection(db, 'pipeline');
    let bookingsQuery = collection(db, 'bookings');
    let targetsQuery = collection(db, 'targets');

    // Managers and Executives can only see their own data
    if (!isManagement) {
      pipelineQuery = query(collection(db, 'pipeline'), where('assignedTo', '==', userProfile.userId)) as any;
      bookingsQuery = query(collection(db, 'bookings'), where('assignedTo', '==', userProfile.userId)) as any;
      targetsQuery = query(collection(db, 'targets'), where('userId', '==', userProfile.userId)) as any;
    }

    // Set up real-time snapshot listeners
    const unsubscribePipeline = onSnapshot(pipelineQuery, (snap) => {
      const dealsList: PipelineDeal[] = [];
      snap.forEach((doc) => {
        dealsList.push({ dealId: doc.id, ...doc.data() } as PipelineDeal);
      });
      setPipeline(dealsList);
    });

    const unsubscribeTargets = onSnapshot(targetsQuery, (snap) => {
      const targetsList: MonthlyTarget[] = [];
      snap.forEach((doc) => {
        targetsList.push({ targetId: doc.id, ...doc.data() } as MonthlyTarget);
      });
      setTargets(targetsList);
    });

    const unsubscribeBookings = onSnapshot(bookingsQuery, (snap) => {
      const bookingsList: Booking[] = [];
      snap.forEach((doc) => {
        bookingsList.push({ bookingId: doc.id, ...doc.data() } as Booking);
      });
      setBookings(bookingsList);
      setLoading(false);
    });

    return () => {
      unsubscribePipeline();
      unsubscribeTargets();
      unsubscribeBookings();
    };
  }, [userProfile, isManagement]);

  // Calculations for current month targets & metrics
  const monthlyDeals = pipeline.filter(d => {
    const dDate = new Date(d.createdAt);
    return dDate.getMonth() + 1 === currentMonthNum && dDate.getFullYear() === currentYearNum;
  });

  // Confirmed and Completed stages count towards active actual revenue
  const closedRevenueDeals = pipeline.filter(d => {
    const dDate = new Date(d.updatedAt || d.createdAt);
    const inCurrentMonth = dDate.getMonth() + 1 === currentMonthNum && dDate.getFullYear() === currentYearNum;
    const isClosedSuccessful = d.stage === 'Confirmed' || d.stage === 'Completed';
    return inCurrentMonth && isClosedSuccessful;
  });

  const actualRevenueThisMonth = closedRevenueDeals.reduce((acc, d) => acc + d.value, 0);

  // Targets calculations
  const activeTargets = targets.filter(t => t.month === currentMonthNum && t.year === currentYearNum);
  const totalTargetThisMonth = activeTargets.reduce((acc, t) => acc + t.targetValue, 0);

  // Calculations by Branch (Main Cottages vs Tuuti)
  const cottagesDeals = pipeline.filter(d => d.branch === 'Cottages');
  const tuutiDeals = pipeline.filter(d => d.branch === 'Tuuti');

  const cottagesRevenue = closedRevenueDeals.filter(d => d.branch === 'Cottages').reduce((acc, d) => acc + d.value, 0);
  const tuutiRevenue = closedRevenueDeals.filter(d => d.branch === 'Tuuti').reduce((acc, d) => acc + d.value, 0);

  // Lead Source counts
  const sourceDistribution = pipeline.reduce((acc: { [key: string]: number }, d) => {
    acc[d.source] = (acc[d.source] || 0) + 1;
    return acc;
  }, {});

  const sourceChartData = Object.entries(sourceDistribution).map(([name, value]) => ({
    name,
    value
  }));

  // Pipeline stage segmentation
  const stagesList = ['Lead', 'Inquiry', 'Proposal', 'Confirmed', 'Checked In', 'Completed'];
  const stageDistributionData = stagesList.map(stage => {
    const stageDeals = pipeline.filter(d => d.stage === stage);
    return {
      name: stage,
      value: stageDeals.reduce((sum, d) => sum + d.value, 0),
      count: stageDeals.length
    };
  });

  // Top Deals
  const topDeals = [...pipeline]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const colors = ['#D85A30', '#993C1D', '#F4A261', '#E76F51', '#2C2C2A', '#8D99AE'];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh] font-sans" id="dashboard-loading-view">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#D85A30] mx-auto"></div>
          <p className="text-sm text-slate-400">Loading Real-time CRM Dashboard panels...</p>
        </div>
      </div>
    );
  }

  // Progress Bar Helper
  const progressPercent = totalTargetThisMonth > 0 
    ? Math.min(Math.round((actualRevenueThisMonth / totalTargetThisMonth) * 100), 100)
    : 0;

  return (
    <div className="space-y-6 font-sans px-1" id="crm-dashboard-root-page">
      
      {/* Top Welcome Title Grid */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4" id="dashboard-header-block">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Mambo, {userProfile?.name}!
          </h2>
          <p className="text-sm text-slate-500">
            Welcome to the internal sales cockpit.{' '}
            {isManagement ? 'Monitoring performance across branches.' : 'Managing your personal pipeline goals.'}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 border border-slate-100 rounded-xl shadow-sm text-xs font-semibold text-slate-700">
          <Calendar className="w-4 h-4 text-primary" />
          <span>
            {today.toLocaleString('default', { month: 'long', year: 'numeric' })} Campaign
          </span>
        </div>
      </div>

      {/* Target Progress Card */}
      <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#D85A30] shadow-sm p-6" id="dashboard-target-summary-row">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#FAECE7] text-[#D85A30] rounded-lg">
                <Target className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-800">
                {isManagement ? 'Combined Sales Agent Revenue Goals' : 'Your Monthly Revenue Performance'}
              </h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-1">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Confirmed Revenue (KES)</span>
                <span className="block text-2xl font-extrabold text-primary match-value">
                  {formatKES(actualRevenueThisMonth).split(' ')[1]} KES
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Monthly Goal Target</span>
                <span className="block text-2xl font-extrabold text-slate-800">
                  {totalTargetThisMonth > 0 ? formatKES(totalTargetThisMonth).split(' ')[1] : 'No Target Set'} KES
                </span>
              </div>
              <div className="col-span-2 md:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Goal Quota Achieved</span>
                <span className="block text-2xl font-extrabold text-[#993C1D] flex items-center gap-1">
                  <span>{totalTargetThisMonth > 0 ? progressPercent : '0'}%</span>
                  {progressPercent >= 100 && <CheckCircle className="w-5 h-5 text-green-600 inline" />}
                </span>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-72 space-y-2 shrink-0">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-500">Progress towards target</span>
              <span className="text-primary">{totalTargetThisMonth > 0 ? progressPercent : '0'}% achieved</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-[#D85A30] to-[#993C1D] h-full rounded-full transition-all duration-500"
                style={{ width: `${totalTargetThisMonth > 0 ? progressPercent : 0}%` }}
              ></div>
            </div>
            <p className="text-[11px] text-slate-400 text-center lg:text-right font-medium">Auto-resets on the 1st of every month</p>
          </div>
        </div>
      </div>

      {/* Basic Metrics Counts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-basic-metrics-grid">
        
        <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#D85A30] shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Pipeline Inquiries</span>
            <span className="text-3xl font-extrabold text-slate-850 block">{pipeline.length} Deals</span>
            <span className="text-xs text-slate-500 block">All sales stages active</span>
          </div>
          <span className="p-3 bg-[#FAECE7] text-[#D85A30] rounded-xl font-medium">
            <Layers className="w-6 h-6" />
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#993C1D] shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Pipeline Value</span>
            <span className="text-2xl font-extrabold text-slate-850 block">
              {formatKES(pipeline.reduce((sum, d) => sum + d.value, 0))}
            </span>
            <span className="text-xs text-slate-500 block">Combined estimations (KES)</span>
          </div>
          <span className="p-3 bg-[#FAECE7] text-[#993C1D] rounded-xl font-medium">
            <DollarSign className="w-6 h-6" />
          </span>
        </div>

        {/* Cottages Branch Portion */}
        <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#D85A30] shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cottages Main Branch</span>
            <span className="text-2xl font-extrabold text-slate-850 block">{cottagesDeals.length} Active Deals</span>
            <span className="text-xs text-slate-500 block">Revenue: {formatKES(cottagesRevenue)}</span>
          </div>
          <span className="p-3 bg-[#FAECE7] text-[#D85A30] rounded-xl font-medium">
            <Landmark className="w-6 h-6" />
          </span>
        </div>

        {/* Tuuti Branch Portion */}
        <div className="bg-white rounded-2xl border border-slate-200 border-b-4 border-[#993C1D] shadow-sm p-5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tuuti Branch Portion</span>
            <span className="text-2xl font-extrabold text-slate-850 block">{tuutiDeals.length} Active Deals</span>
            <span className="text-xs text-slate-500 block">Revenue: {formatKES(tuutiRevenue)}</span>
          </div>
          <span className="p-3 bg-[#FAECE7] text-[#993C1D] rounded-xl font-medium">
            <TrendingUp className="w-6 h-6" />
          </span>
        </div>

      </div>

      {/* Real-time Team Member Targets comparison for Super Admin and Senior Managers */}
      {isManagement && activeTargets.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4" id="dashboard-team-performance-grid">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <span>Real-time Team Revenue Progress vs Targets</span>
            </h3>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">({activeTargets.length} Sales Officers Active)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTargets.map(agentTarget => {
              const rat = agentTarget.targetValue > 0 
                ? Math.round((agentTarget.actualRevenue / agentTarget.targetValue) * 100)
                : 0;
              return (
                <div key={agentTarget.targetId} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">{agentTarget.userName}</span>
                    <span className="text-[10px] text-slate-400">({agentTarget.userEmail})</span>
                  </div>
                  <div className="flex justify-between items-end text-xs">
                    <span className="text-slate-500">
                      Actual: <strong className="text-primary">{formatKES(agentTarget.actualRevenue)}</strong>
                    </span>
                    <span className="font-semibold text-slate-700">Target: {formatKES(agentTarget.targetValue)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div 
                      className="bg-primary h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(rat, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-[#993C1D]">{rat}% Meta Target achieved</span>
                    {rat >= 100 && <span className="text-green-600 bg-green-50 px-2 rounded-full border border-green-100">Target hit !</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Charts & Lists Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-charts-visualizers">
        
        {/* Stages Pipeline Valuation Chart */}
        <div className="lg:col-span-8 bg-white border border-slate-200 border-b-4 border-[#D85A30] rounded-2xl shadow-sm p-5 space-y-4" id="dashboard-chart-valuation">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-primary" />
            Revenue value locked by Sales Stage (KES)
          </h3>
          <div className="h-64" id="recharts-stage-valuation-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageDistributionData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" fontSize={11} tickLine={false} stroke="#94A3B8" />
                <YAxis 
                  fontSize={10} 
                  tickLine={false} 
                  stroke="#94A3B8" 
                  tickFormatter={(val) => val >= 1000000 ? `${val/1000000}M` : val >= 1000 ? `${val/1000}k` : val} 
                />
                <Tooltip 
                  formatter={(value) => [formatKES(Number(value)), 'Valuation锁']} 
                  contentStyle={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '12px' }}
                />
                <Bar dataKey="value" fill="#D85A30" radius={[6, 6, 0, 0]}>
                  {stageDistributionData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={idx >= 3 ? '#993C1D' : '#D85A30'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Source distribution */}
        <div className="lg:col-span-4 bg-white border border-slate-200 border-b-4 border-[#993C1D] rounded-2xl shadow-sm p-5 space-y-4" id="dashboard-chart-sources">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
            <Users className="w-4 h-4 text-primary" />
            Active Deal Source Breakdown
          </h3>
          {sourceChartData.length === 0 ? (
            <div className="text-center py-12 text-slate-450 text-xs font-sans">
              No lead source classifications logged yet.
            </div>
          ) : (
            <div className="flex flex-col justify-center items-center h-64">
              <div className="w-full h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {sourceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2 max-h-16 overflow-y-auto">
                {sourceChartData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-[10px] font-sans">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span className="text-slate-500 font-medium">{entry.name} ({entry.value})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top active high value deals list of the month */}
        <div className="lg:col-span-12 bg-white border border-slate-200 border-b-4 border-[#D85A30] rounded-2xl shadow-sm p-5 space-y-4" id="dashboard-pinnacle-deals">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
              <Award className="w-4 h-4 text-primary" />
              Top active high value deals (KES)
            </h3>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">Realtime Audit</span>
          </div>
          {topDeals.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">No active pipeline deals found. Create some in the Pipeline board!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-xs font-sans" id="top-deals-comparison-table">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-left font-semibold">
                    <th className="py-2.5 px-3">Client Prospect</th>
                    <th className="py-2.5 px-3">Branch Location</th>
                    <th className="py-2.5 px-3">Value (KES)</th>
                    <th className="py-2.5 px-3">Current Pipeline Stage</th>
                    <th className="py-2.5 px-3">Assigned Associate</th>
                    <th className="py-2.5 px-3">Creation Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topDeals.map(deal => (
                    <tr key={deal.dealId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-800 block">{deal.clientName}</span>
                        <span className="text-[10px] text-slate-400 font-medium tracking-wider block uppercase">{deal.clientType} profile</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${deal.branch === 'Tuuti' ? 'bg-amber-100 text-[#993C1D]' : 'bg-orange-100 text-[#D85A30]'}`}>
                          {deal.branch}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-extrabold text-[#993C1D]">
                        {formatKES(deal.value)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-200">
                          {deal.stage}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {deal.assignedToName || 'Unassigned'}
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        {new Date(deal.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
