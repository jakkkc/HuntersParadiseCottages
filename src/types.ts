export type UserRole = 'Super Admin' | 'Senior Manager' | 'Manager' | 'Sales Executive';
export type BranchName = 'Cottages' | 'Tuuti';
export type ClientType = 'corporate' | 'individual';
export type LeadSource = 'Walk-in' | 'Phone' | 'Email' | 'WhatsApp' | 'Social Media' | 'Referral';
export type PipelineStage = 'Lead' | 'Inquiry' | 'Proposal' | 'Confirmed' | 'Checked In' | 'Completed';
export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
export type PaymentStatus = 'Pending' | 'Partial' | 'Paid';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  assignedBranch: BranchName | 'Both';
  createdAt: string;
}

export interface PrimaryContact {
  name: string;
  title: string;
  phone: string;
  email: string;
}

export interface ClientProfile {
  clientId: string;
  type: ClientType;
  // Corporate specific
  companyName?: string;
  industry?: string;
  primaryContact?: PrimaryContact;
  secondaryContacts?: string[]; // Array of strings or brief text
  physicalAddress?: string;
  kraPin?: string;
  negotiatedRates?: { [key: string]: number }; // Stores negotiated rates for future reference
  branchPreference?: BranchName | 'Both';
  
  // Individual specific
  fullName?: string;
  phone?: string;
  email?: string;
  idPassport?: string;
  
  // Shared
  notes?: string;
  assignedTo: string; // User ID
  assignedToName?: string; // Cache sales rep name for convenience
  createdAt: string;
  updatedAt: string;
}

export interface PipelineDeal {
  dealId: string;
  clientId: string; // Ref to ClientProfile
  clientName: string; // Company Name or Individual Guest Name
  clientType: ClientType;
  branch: BranchName;
  value: number; // in KES
  source: LeadSource;
  assignedTo: string; // User ID
  assignedToName?: string; // Cache rep name
  stage: PipelineStage;
  expectedDate: string; // ISO string
  createdAt: string;
  updatedAt: string;
  stageChangedAt: string; // For calculating days in current stage
  notes?: string;
}

export interface QuotationItem {
  id: string;
  description: string;
  category: 'Rooms' | 'Conference' | 'GymSwimming' | 'Excursions' | 'Other';
  originalRate: number;
  negotiatedRate: number;
  quantity: number;
  days?: number;
  subtotal: number;
}

export interface Quotation {
  quotationId: string;
  dealId: string;
  quoteNumber: string;
  branch: BranchName;
  clientName: string;
  companyName?: string;
  clientEmail?: string;
  clientPhone?: string;
  items: QuotationItem[];
  subtotal: number;
  discount: number;
  total: number;
  validityPeriod: number; // in days, e.g., 30
  terms: string;
  status: QuoteStatus;
  createdBy: string; // User ID
  createdByName: string;
  createdAt: string;
}

export interface Booking {
  bookingId: string;
  clientId: string;
  clientName: string;
  branch: BranchName;
  bookingType: 'Room' | 'Event';
  roomType?: string; // e.g. "Superior (Engwe)", "Executive (Kibeu)", "VIP Villa (Etalangi)" or "Conference Package"
  checkInDate: string; // ISO Date YYYY-MM-DD
  checkOutDate: string; // ISO Date YYYY-MM-DD
  guestsCount: number;
  mealPlan: 'None' | 'B&B Single' | 'B&B Double' | 'HB Single' | 'HB Double' | 'FB Single' | 'FB Double';
  specialRequests?: string;
  paymentStatus: PaymentStatus;
  amountDue: number; // in KES
  amountPaid: number; // in KES
  balance: number; // in KES
  source: LeadSource;
  assignedTo: string; // User ID
  assignedToName?: string;
  dealId?: string; // Option link to pipeline deal
  createdAt: string;
}

export interface RateItem {
  bbSingle: number;
  bbDouble: number;
  hbSingle: number;
  hbDouble: number;
  fbSingle: number;
  fbDouble: number;
}

export interface RateCard {
  cardId: 'cottages' | 'tuuti';
  branch: BranchName;
  rooms: { [roomName: string]: RateItem };
  conferences: { [packageName: string]: number };
  gymSwimming: { [tariffName: string]: number };
  excursions: { [location: string]: number };
  updatedAt: string;
  updatedBy: string; // Email of Super Admin
}

export interface MonthlyTarget {
  targetId: string; // userId_year_month
  userId: string;
  userEmail: string;
  userName: string;
  year: number;
  month: number; // 1-12
  targetValue: number; // KES
  actualRevenue: number; // KES
  updatedAt: string;
}

export interface ActivityLog {
  logId: string;
  refId: string; // dealId or clientId
  type: 'deal' | 'client' | 'booking' | 'quotation';
  action: string; // e.g., "Created Deal", "Moved status to Inquiry from Lead"
  performedBy: string; // User email
  performedByName: string; // User name
  timestamp: string; // ISO string
}

export interface InAppReminder {
  id: string;
  title: string;
  description: string;
  date: string; // ISO string or date string
  userId: string;
  read: boolean;
  refId?: string; // Optional deal or client reference
  refType?: 'deal' | 'client' | 'booking';
  createdAt: string;
}
