import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, UserRole, BranchName } from '../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  googleToken: string | null;
  needsGoogleAuth: boolean;
  hasGoogleCalendarAccess: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string, role: UserRole, branch: BranchName | 'Both') => Promise<void>;
  logoutUser: () => Promise<void>;
  requestGoogleCalendarOAuth: () => Promise<void>;
  loginAsDemoUser: (email: string) => Promise<void>;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Default rate card data to seed if missing
const DEFAULT_COTTAGES_RATES = {
  rooms: {
    'Superior (Engwe)': { bbSingle: 13000, bbDouble: 17000, hbSingle: 15500, hbDouble: 22000, fbSingle: 18000, fbDouble: 27000 },
    'Executive (Kibeu)': { bbSingle: 17000, bbDouble: 21000, hbSingle: 19500, hbDouble: 26000, fbSingle: 22000, fbDouble: 31000 },
    'Deluxe (Emboko)': { bbSingle: 23000, bbDouble: 27000, hbSingle: 25500, hbDouble: 32000, fbSingle: 28000, fbDouble: 37000 },
    'Family (Enjofu)': { bbSingle: 35000, bbDouble: 35000, hbSingle: 45000, hbDouble: 45000, fbSingle: 55000, fbDouble: 55000 },
    'VIP Villa (Etalangi)': { bbSingle: 50000, bbDouble: 50000, hbSingle: 55000, hbDouble: 55000, fbSingle: 60000, fbDouble: 60000 }
  },
  conferences: {
    'Full Day Conference': 3500,
    'Half Day Conference': 3100,
    'VIP Conference Package': 5000
  },
  gymSwimming: {
    'Daily Full Membership Single': 800,
    'Daily Full Membership Double': 1500,
    'Monthly Full Membership Single': 8000,
    'Monthly Full Membership Double': 12800,
    'Annual Full Membership Single': 72000,
    'Annual Full Membership Double': 76800,
    'Daily Off Peak Single': 650,
    'Daily Off Peak Double': 1300,
    'Monthly Off Peak Single': 6500,
    'Monthly Off Peak Double': 12700,
    'Annual Off Peak Single': 72000,
    'Annual Off Peak Double': 76800,
    'Daily Swimming Adult': 800,
    'Daily Swimming Kid': 500,
    'Monthly Swimming Adult': 10000,
    'Monthly Swimming Kid': 9000,
    'Combined Daily Gym & Swim': 1000,
    'Combined Monthly Gym & Swim': 15000
  },
  excursions: {
    'Mt Elgon National Park': 35000,
    'Miti Park': 12000,
    'Nabuyole Falls': 12000,
    'Sangalo Rocks': 12000,
    'Nabongo Mumia Cultural Center': 12000,
    'Kakapel National Museum': 15000
  }
};

const DEFAULT_TUUTI_RATES = {
  rooms: {
    'Kibeu (Executive)': { bbSingle: 15000, bbDouble: 18000, hbSingle: 17000, hbDouble: 23000, fbSingle: 19000, fbDouble: 27000 }
  },
  conferences: {
    'Full Day Conference': 3500,
    'Half Day Conference': 3100,
    'VIP Conference Package': 5000
  },
  gymSwimming: {
    'Daily Swimming Adult': 800,
    'Daily Swimming Kid': 500
  },
  excursions: {
    'Mt Elgon National Park': 35000,
    'Miti Park': 12000,
    'Nabuyole Falls': 12000,
    'Sangalo Rocks': 12000,
    'Nabongo Mumia Cultural Center': 12000,
    'Kakapel National Museum': 15000
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Auto-seeds rate cards if missing in database
  const seedRateCards = async () => {
    try {
      const cottageRef = doc(db, 'rate_cards', 'cottages');
      const tuutiRef = doc(db, 'rate_cards', 'tuuti');

      const cottageSnap = await getDoc(cottageRef);
      if (!cottageSnap.exists()) {
        await setDoc(cottageRef, {
          branch: 'Cottages',
          rooms: DEFAULT_COTTAGES_RATES.rooms,
          conferences: DEFAULT_COTTAGES_RATES.conferences,
          gymSwimming: DEFAULT_COTTAGES_RATES.gymSwimming,
          excursions: DEFAULT_COTTAGES_RATES.excursions,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system@huntersparadise.ke'
        });
      }

      const tuutiSnap = await getDoc(tuutiRef);
      if (!tuutiSnap.exists()) {
        await setDoc(tuutiRef, {
          branch: 'Tuuti',
          rooms: DEFAULT_TUUTI_RATES.rooms,
          conferences: DEFAULT_TUUTI_RATES.conferences,
          gymSwimming: DEFAULT_TUUTI_RATES.gymSwimming,
          excursions: DEFAULT_TUUTI_RATES.excursions,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system@huntersparadise.ke'
        });
      }
    } catch (e) {
      console.warn("Auto-seeding rate cards warning:", e);
    }
  };

  // Synchronizes authenticated Firebase user to Firestore /users collection
  const syncUserProfile = async (firebaseUser: User) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      let role: UserRole = 'Sales Executive';
      let branch: BranchName | 'Both' = 'Cottages';
      let name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Sales Rep';

      const email = firebaseUser.email || '';
      
      // Auto-assign roles for pre-defined corporate entities
      if (email === 'jackson.munene@huntersparadise.ke') {
        role = 'Super Admin';
        branch = 'Both';
      } else if (email === 'calvince.okomo@huntersparadise.ke') {
        role = 'Senior Manager';
        branch = 'Both';
      } else if (email === 'jane.adala@huntersparadise.ke') {
        role = 'Manager';
        branch = 'Both';
      } else if (email === 'mildred@huntersparadise.ke') {
        role = 'Sales Executive';
        branch = 'Both';
      }

      if (userSnap.exists()) {
        const existingProfile = userSnap.data() as UserProfile;
        setUserProfile(existingProfile);
      } else {
        const newProfile: UserProfile = {
          userId: firebaseUser.uid,
          email,
          name,
          role,
          assignedBranch: branch,
          createdAt: new Date().toISOString(),
        };
        await setDoc(userRef, newProfile);
        setUserProfile(newProfile);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
    }
  };

  // Observe Firebase Authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setError(null);
      if (firebaseUser) {
        setUser(firebaseUser);
        setIsDemoMode(false);
        await syncUserProfile(firebaseUser);
        await seedRateCards();
      } else {
        // Fallback checks for demo local storage modes
        const cachedDemoUser = localStorage.getItem('demo_user_profile');
        if (cachedDemoUser) {
          try {
            const profile = JSON.parse(cachedDemoUser) as UserProfile;
            setUserProfile(profile);
            setIsDemoMode(true);
          } catch {
            setUser(null);
            setUserProfile(null);
          }
        } else {
          setUser(null);
          setUserProfile(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Standard email logging
  const signInWithEmail = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message || 'Email authentication failed');
      setLoading(false);
      throw err;
    }
  };

  // Sign up credentials
  const signUpWithEmail = async (
    email: string, 
    password: string, 
    name: string, 
    role: UserRole, 
    branch: BranchName | 'Both'
  ) => {
    setLoading(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const userRef = doc(db, 'users', cred.user.uid);
      const newProfile: UserProfile = {
        userId: cred.user.uid,
        email,
        name,
        role,
        assignedBranch: branch,
        createdAt: new Date().toISOString()
      };
      await setDoc(userRef, newProfile);
      setUserProfile(newProfile);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      setLoading(false);
      throw err;
    }
  };

  // Google Sign-In with popup
  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
      }
    } catch (err: any) {
      setError(err.message || 'Google Auth Popup closed or failed');
      setLoading(false);
      throw err;
    }
  };

  // OAuth Setup triggered explicitly for Calendar Reminders
  const requestGoogleCalendarOAuth = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        localStorage.setItem('google_cal_access_token', credential.accessToken);
      }
    } catch (err: any) {
      console.error("Google Calendar OAuth error:", err);
      throw err;
    }
  };

  // High-fidelity local simulation bypass targeting testing personas
  const loginAsDemoUser = async (email: string) => {
    setLoading(true);
    setError(null);
    await seedRateCards();
    
    let role: UserRole = 'Sales Executive';
    let branch: BranchName | 'Both' = 'Cottages';
    let name = '';

    if (email === 'jackson.munene@huntersparadise.ke') {
      role = 'Super Admin';
      branch = 'Both';
      name = 'Jackson Munene';
    } else if (email === 'calvince.okomo@huntersparadise.ke') {
      role = 'Senior Manager';
      branch = 'Both';
      name = 'Calvince Okomo';
    } else if (email === 'jane.adala@huntersparadise.ke') {
      role = 'Manager';
      branch = 'Both';
      name = 'Jane Adala';
    } else if (email === 'mildred@huntersparadise.ke') {
      role = 'Sales Executive';
      branch = 'Both';
      name = 'Mildred Executive';
    } else {
      role = 'Sales Executive';
      branch = 'Cottages';
      name = email.split('@')[0];
    }

    const mockProfile: UserProfile = {
      userId: 'demo_' + role.replace(' ', '_').toLowerCase(),
      email,
      name,
      role,
      assignedBranch: branch,
      createdAt: new Date().toISOString()
    };

    localStorage.setItem('demo_user_profile', JSON.stringify(mockProfile));
    setUserProfile(mockProfile);
    setIsDemoMode(true);
    setUser(null); // No Firebase user representation in pure Demo mode
    setLoading(false);
  };

  // Signout operation
  const logoutUser = async () => {
    setLoading(true);
    try {
      localStorage.removeItem('demo_user_profile');
      localStorage.removeItem('google_cal_access_token');
      await signOut(auth);
      setGoogleToken(null);
      setUser(null);
      setUserProfile(null);
      setIsDemoMode(false);
    } catch (err: any) {
      setError(err.message || 'Logout error');
    } finally {
      setLoading(false);
    }
  };

  const hasGoogleCalendarAccess = !!googleToken;
  const needsGoogleAuth = !googleToken;

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      loading,
      error,
      googleToken,
      needsGoogleAuth,
      hasGoogleCalendarAccess,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      logoutUser,
      requestGoogleCalendarOAuth,
      loginAsDemoUser,
      isDemoMode
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};
