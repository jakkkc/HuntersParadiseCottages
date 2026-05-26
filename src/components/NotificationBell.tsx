import React, { useState, useEffect } from 'react';
import { Bell, Calendar, Check, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { InAppReminder } from '../types';

export default function NotificationBell() {
  const { userProfile, googleToken, requestGoogleCalendarOAuth } = useAuth();
  const [reminders, setReminders] = useState<InAppReminder[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load real-time in-app reminders from firestore belonging to the current sales rep
  useEffect(() => {
    if (!userProfile) return;

    const remindersRef = collection(db, 'in_app_reminders');
    const q = query(remindersRef, where('userId', '==', userProfile.userId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: InAppReminder[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as InAppReminder);
      });
      // Sort: unread first, then newest
      list.sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      setReminders(list);
    }, (error) => {
      console.error("Error loading reminders:", error);
    });

    return () => unsubscribe();
  }, [userProfile]);

  const unreadCount = reminders.filter(r => !r.read).length;

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const ref = doc(db, 'in_app_reminders', id);
      await updateDoc(ref, { read: true });
    } catch (err) {
      console.error("Error marking reminder as read:", err);
    }
  };

  const handleDeleteReminder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'in_app_reminders', id));
    } catch (err) {
      console.error("Error deleting reminder:", err);
    }
  };

  const handleClearAll = async () => {
    try {
      const promises = reminders.map(r => deleteDoc(doc(db, 'in_app_reminders', r.id)));
      await Promise.all(promises);
      setIsOpen(false);
    } catch (err) {
      console.error("Error clearing reminders:", err);
    }
  };

  const handleRequestOAuth = async () => {
    setIsSyncing(true);
    try {
      await requestGoogleCalendarOAuth();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="relative font-sans" id="header-notifications-container">
      {/* Trigger Bell Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-[#D85A30] hover:bg-slate-50 rounded-full transition-colors focus:outline-none"
        id="notification-bell-button"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-content-center bg-red-500 rounded-full text-[10px] font-bold text-white ring-2 ring-white" id="notification-badge-count">
            <span className="mx-auto">{unreadCount}</span>
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden" id="notification-dropdown-panel">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <span>Reminders & Notifications</span>
                <span className="px-2 py-0.5 text-xs bg-[#FAECE7] text-[#D85A30] font-sans font-medium rounded-full">
                  {reminders.length} total
                </span>
              </h3>
              {reminders.length > 0 && (
                <button 
                  onClick={handleClearAll}
                  className="text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"
                  id="clear-all-reminders-button"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear all</span>
                </button>
              )}
            </div>

            {/* Google Calendar Sync Card */}
            <div className="p-3 bg-[#FAECE7] border-b border-slate-100 flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-[#993C1D] flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Google Calendar Status
                </span>
                {googleToken ? (
                  <span className="text-[10px] text-green-700 bg-green-50 font-medium px-2 py-0.5 rounded-full flex items-center gap-0.5 border border-green-200">
                    <ShieldCheck className="w-3 h-3 text-green-600" />
                    Synced
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-700 bg-amber-50 font-medium px-2 py-0.5 rounded-full border border-amber-200">
                    Not Connected
                  </span>
                )}
              </div>
              {!googleToken && (
                <button
                  onClick={handleRequestOAuth}
                  disabled={isSyncing}
                  className="mt-1.5 w-full bg-[#D85A30] hover:bg-[#993C1D] text-white py-1 px-3 text-xs font-medium rounded-lg shadow-sm font-sans flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                  id="sync-google-calendar-oauth-button"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Authorizing in popup...' : 'Connect Google Calendar'}
                </button>
              )}
            </div>

            {/* Reminders List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100" id="notification-list-scrollable">
              {reminders.length === 0 ? (
                <div className="p-8 text-center" id="empty-reminders-view">
                  <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No active alerts or follow-up task notifications found.</p>
                </div>
              ) : (
                reminders.map((reminder) => (
                  <div 
                    key={reminder.id}
                    className={`p-3.5 flex gap-3 transition-colors hover:bg-slate-50 ${reminder.read ? 'bg-white opacity-70' : 'bg-orange-50/20'}`}
                  >
                    <div className="flex-1">
                      <div className="flex justify-between items-start gap-1">
                        <h4 className={`text-xs font-semibold text-slate-800 ${reminder.read ? 'line-through' : ''}`}>
                          {reminder.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {new Date(reminder.date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-sans">{reminder.description}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end justify-center">
                      {!reminder.read && (
                        <button
                          onClick={(e) => handleMarkAsRead(reminder.id, e)}
                          className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-all"
                          title="Mark as completed"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDeleteReminder(reminder.id, e)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                        title="Delete task alert"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
