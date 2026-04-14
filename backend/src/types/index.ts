export enum DealType {
  CAR            = 0,
  PROPERTY       = 1,
  FREELANCE      = 2,
  PSL_FRANCHISE  = 3,
  PSL_PLAYER     = 4,
  MARKETPLACE    = 5,
  CUSTOM         = 6,
}

export enum DealState {
  PENDING   = 0,
  LOCKED    = 1,
  COMPLETED = 2,
  DEFAULTED = 3,
  DISPUTED  = 4,
  CLOSED    = 5,
}

export enum RiskLevel {
  LOW      = 0,
  MEDIUM   = 1,
  HIGH     = 2,
  CRITICAL = 3,
}

export interface Milestone {
  label:     string;
  amount:    bigint;
  completed: boolean;
}

export interface OnChainDeal {
  id:               bigint;
  dealType:         number;
  state:            number;
  buyer:            string;
  seller:           string;
  totalAmount:      bigint;
  sellerBond:       bigint;
  gracePeriodEnd:   bigint;
  disputed:         boolean;
  buyerEvidence:    string;
  sellerEvidence:   string;
  currentMilestone: number;
  milestoneCount:   number;
  createdAt:        bigint;
}

export interface CreateDealRequest {
  sellerAddress:     string;
  dealType:          number;
  totalAmountWei:    string;
  collateralPercent: number;
  milestoneLabels:   string[];
  milestoneAmounts:  string[];
  title:             string;
  amountPkr:         number;
  buyerWallet:       string;
}

export interface AICollateralRequest {
  dealType:    string;
  amountPkr:   number;
  buyerScore:  number;
  sellerScore: number;
}

export interface AICollateralResult {
  collateralPercent: number;
  riskLevel:         string;
  reason:            string;
  fraudFlag:         boolean;
}

export interface AIFraudRequest {
  dealType:    string;
  description: string;
  amountPkr:   number;
  sellerScore: number;
}

export interface AIFraudResult {
  riskLevel:      string;
  flags:          string[];
  recommendation: string;
}

export interface AITemplateRequest {
  description: string;
  dealTypeHint?: string;
}

export interface AITemplateResult {
  dealType:               string;
  title:                  string;
  milestones:             { label: string; percent: number }[];
  gracePeriodHours:       number;
  suggestedCollateralPct: number;
  detectedLanguage:       string;
  redFlag?:               boolean;
  redFlagReason?:         string;
}

export interface AIRiskSummaryRequest {
  walletAddress:   string;
  dealContext:     string;
  dealsCompleted:  number;
  dealsDefaulted:  number;
  pakkaScore:      number;
  avgDealValuePkr: number;
}

export interface AIRiskSummaryResult {
  riskLevel:     string;
  summary:       string;
  greenFlags:    string[];
  yellowFlags:   string[];
  recommendation: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?:   T;
  error?:  string;
}
