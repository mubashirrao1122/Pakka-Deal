import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  AICollateralRequest,
  AICollateralResult,
  AIFraudRequest,
  AIFraudResult,
  AITemplateRequest,
  AITemplateResult,
  AIRiskSummaryRequest,
  AIRiskSummaryResult,
} from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

function safeParseJSON<T>(text: string): T {
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  return JSON.parse(cleaned) as T;
}
export function riskLevelToUint8(level: string): number {
  const map: Record<string, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3,
  };
  return map[level?.toUpperCase()] ?? 1;
}

export const aiEngineService = {


  async calculateCollateral(req: AICollateralRequest): Promise<AICollateralResult> {
    const prompt = `You are a risk engine for Pakka Deal — a Pakistani 
blockchain escrow platform. Calculate the correct collateral 
percentage for this deal.

Deal type: ${req.dealType}
Deal amount: ${req.amountPkr.toLocaleString()} PKR
Buyer Pakka Score: ${req.buyerScore} / 1000
Seller Pakka Score: ${req.sellerScore} / 1000

Rules to follow:
- Base collateral: 20%
- If buyer score >= 851 (Pakka Verified): reduce by 12%
- If buyer score >= 601 (Trusted): reduce by 8%
- If buyer score >= 301 (Verified): reduce by 4%
- If buyer score < 300 (New User): minimum 30%
- PSL_FRANCHISE deals: add 10% to base
- PROPERTY deals above 1 crore PKR: add 5% to base
- Amounts above 50 lakh PKR: add 3% risk premium
- Final range: minimum 8%, maximum 40%
- fraudFlag = true only if amount is suspiciously low 
  for the deal type (more than 70% below typical market)

Return ONLY valid raw JSON. No explanation, no markdown, no conversational text.
{
  "collateralPercent": 18,
  "riskLevel": "LOW",
  "reason": "Brief one sentence explanation",
  "fraudFlag": false
}

riskLevel must be one of: LOW, MEDIUM, HIGH, CRITICAL`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return safeParseJSON<AICollateralResult>(text);
  },

  async detectFraud(req: AIFraudRequest): Promise<AIFraudResult> {
    const marketContext = `
Pakistani market price context (approximate ranges in PKR):
- Honda Civic 2021-2023: 38L - 50L
- Toyota Corolla 2021-2023: 38L - 52L  
- Suzuki Alto 2021-2023: 18L - 28L
- Honda City 2021-2023: 32L - 44L
- DHA Lahore 10 Marla plot: 1.5Cr - 3Cr
- Gulberg Lahore 5 Marla: 80L - 1.5Cr
- Karachi Defence bungalow: 3Cr - 10Cr
- iPhone 15 Pro Max: 3.5L - 4.5L
- Samsung Galaxy S24: 2.5L - 3.5L`;

    const prompt = `You are a fraud detection engine for Pakka Deal — 
a Pakistani escrow platform. Analyze this deal for fraud risk.

Deal description: ${req.description}
Deal type: ${req.dealType}
Listed price: ${req.amountPkr.toLocaleString()} PKR
Seller Pakka Score: ${req.sellerScore} / 1000

${marketContext}

Analyze and return ONLY valid raw JSON. No explanation, no markdown, no conversational text.
{
  "riskLevel": "LOW",
  "flags": ["list of specific red flags found, empty if none"],
  "recommendation": "One actionable sentence for the buyer"
}

riskLevel rules:
- LOW: Price within 30% of market, seller has decent score
- MEDIUM: Price 30-60% below market OR seller score under 300
- HIGH: Price over 60% below market OR multiple red flags
- CRITICAL: Price over 80% below market — very likely scam`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return safeParseJSON<AIFraudResult>(text);
  },

  async generateTemplate(req: AITemplateRequest): Promise<AITemplateResult> {
    const dealTypeHintClause = req.dealTypeHint
      ? `\nThe user has explicitly selected deal category: "${req.dealTypeHint}". You MUST use this as the dealType (map PSL_FRANCHISE_BID → PSL_FRANCHISE, PSL_PLAYER_TRANSFER → PSL_PLAYER). Do NOT override the user's selection.\n`
      : '';

    const prompt = `SYSTEM: You are a JSON-only API. You MUST respond with a single raw JSON object. 
Do NOT wrap it in markdown code fences (\`\`\`). Do NOT include any text, explanation, or commentary before or after the JSON.

ROLE: You are the AI Deal Oracle for Pakka Deal — a Pakistani blockchain escrow platform.
You must extract deal structure from the user's description AND evaluate the deal for potential fraud.
The user may write in English, Urdu, or Roman Urdu (Urdu written in English letters).
${dealTypeHintClause}
User description: "${req.description}"

Available deal types: 
CAR, PROPERTY, FREELANCE, PSL_FRANCHISE, PSL_PLAYER, 
MARKETPLACE, CUSTOM

══════════════════════════════════════════════════
SECTION 1: SCAM / RED FLAG DETECTION (CRITICAL)
══════════════════════════════════════════════════

You MUST cross-reference the item described against the asking price using Pakistani market knowledge:

Pakistani market price context (approximate ranges in PKR):
- Honda Civic 2021-2025: 38L - 65L
- Toyota Corolla 2021-2025: 38L - 60L
- Suzuki Alto 2021-2025: 18L - 30L
- Honda City 2021-2025: 32L - 48L
- Toyota Yaris 2021-2025: 30L - 46L
- Suzuki Swift 2021-2025: 25L - 38L
- DHA Lahore 10 Marla plot: 1.5Cr - 3Cr
- Gulberg Lahore 5 Marla: 80L - 1.5Cr
- Karachi Defence bungalow: 3Cr - 10Cr
- Bahria Town 5 Marla: 40L - 80L
- iPhone 15/16 Pro Max: 3.5L - 5.5L
- Samsung Galaxy S24/S25: 2.5L - 4L
- PSL Franchise (estimated): 50Cr - 200Cr+
- PSL Player Transfer: 20L - 5Cr+

Rules:
- If the listed price is MORE THAN 50% below the expected market range for the described item, set "redFlag": true.
- Example: "2023 Honda Civic for 5 Lakh PKR" → redFlag: true (market is 38L-65L, 5L is ~87% below).
- Example: "Toyota Corolla 2022 for 42 Lakh" → redFlag: false (within market range).
- If redFlag is true, include a clear "redFlagReason" explaining the price vs market mismatch.
- If the description is vague or no price can be inferred, set redFlag: false.

══════════════════════════════════════════════════
SECTION 2: DYNAMIC COLLATERAL PRICING
══════════════════════════════════════════════════

Do NOT default to 20%. Calculate suggestedCollateralPct dynamically:

- For LOW risk deals (known item, fair price, common category): 10-15%
- For MEDIUM risk deals (high value, moderate complexity): 18-25%
- For HIGH risk deals (very high value, uncommon deal, price slightly off): 28-35%
- If redFlag is true (scam suspected): always set collateral to 35-40%
- PSL_FRANCHISE / PSL_PLAYER deals: minimum 25% (high-stakes sports deals)
- PROPERTY deals above 1 Crore PKR: minimum 22%
- Very small deals under 50,000 PKR with no red flags: 8-12%

══════════════════════════════════════════════════
SECTION 3: MILESTONE TEMPLATES (STRICTLY ENFORCED)
══════════════════════════════════════════════════

Milestone rules:
- **CRITICAL RULE**: If the deal total is above 1,000,000 PKR (10 Lakh) OR the deal type is CAR, PROPERTY, PSL_FRANCHISE, or PSL_PLAYER, you MUST generate at least 3 distinct milestones. NEVER return a single 100% milestone for high-value deals.
- A single milestone (100%) is ONLY acceptable for very small, simple transactions (e.g., a low-value physical item under 50,000 PKR or a quick freelance gig).

MANDATORY templates by type (you MUST use these exact milestone structures):

- **PSL_FRANCHISE** (PSL_FRANCHISE_BID): EXACTLY 3 milestones:
  1. "Bid Deposit Locked" — 30%
  2. "PCB Verification & Approval" — 40%
  3. "Season Start Confirmation" — 30%

- **PSL_PLAYER** (PSL_PLAYER_TRANSFER): EXACTLY 3 milestones:
  1. "Transfer Approval & Registration" — 30%
  2. "Contract Signing & Medical" — 40%
  3. "Match Fees & Performance Bond" — 30%

- **PROPERTY**: EXACTLY 3 milestones:
  1. "Token / Bayana" — 10-20%
  2. "File Verification & Registry" — 30-50%
  3. "Physical Handover" — remaining %

- **CAR**: EXACTLY 3 milestones:
  1. "Token Money / Bayana" — 10-20%
  2. "Inspection & Transfer" — 40-50%
  3. "Final Handover & Delivery" — remaining %

- **FREELANCE**: 2-3 milestones:
  1. "Deposit / Advance" — 20-30%
  2. "Progress Delivery" — 30-40%
  3. "Final Delivery" — remaining %

- **MARKETPLACE**: If amount >= 1,000,000 PKR, use 3 milestones similar to CAR. Otherwise 1-2 milestones.
- **CUSTOM**: use your judgment, but if amount >= 1,000,000 PKR, always use at least 3 milestones.
- The sum of all milestone percentages MUST equal exactly 100.

Grace period rules:
- CAR / MARKETPLACE: 48 hours
- FREELANCE: 72 hours per milestone
- PROPERTY: 168 hours (7 days) per milestone
- PSL_FRANCHISE / PSL_PLAYER: 720 hours (30 days) per milestone

══════════════════════════════════════════════════
REQUIRED JSON OUTPUT — exactly this shape:
══════════════════════════════════════════════════
{
  "dealType": "CAR",
  "title": "Short descriptive title in English (max 60 chars)",
  "milestones": [
    { "label": "Token Money / Bayana", "percent": 15 },
    { "label": "Inspection & Transfer", "percent": 45 },
    { "label": "Final Handover & Delivery", "percent": 40 }
  ],
  "gracePeriodHours": 48,
  "suggestedCollateralPct": 18,
  "detectedLanguage": "roman_urdu",
  "redFlag": false,
  "redFlagReason": ""
}

RULES:
- dealType must be one of: CAR, PROPERTY, FREELANCE, PSL_FRANCHISE, PSL_PLAYER, MARKETPLACE, CUSTOM
- milestones[].percent values MUST sum to exactly 100
- For CAR, PROPERTY, PSL_FRANCHISE, PSL_PLAYER deals OR any deal above 1,000,000 PKR: you MUST return at least 3 milestones. A single 100% milestone is FORBIDDEN for these.
- A single milestone is ONLY allowed for small, simple deals under 50,000 PKR.
- detectedLanguage must be one of: "english", "urdu", "roman_urdu"
- redFlag must be a boolean. If true, redFlagReason must be a non-empty string explaining the market value mismatch.
- suggestedCollateralPct must follow the dynamic pricing rules above, NOT a flat 20%.
- Output ONLY the JSON object. No markdown. No explanation.`;

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const text = result.response.text();
      const parsed = safeParseJSON<AITemplateResult>(text);

      // Validate milestones sum to 100
      const sum = parsed.milestones.reduce((acc, m) => acc + m.percent, 0);
      if (Math.abs(sum - 100) > 1) {
        throw new Error(`AI returned milestones summing to ${sum}%, not 100%`);
      }

      return parsed;
    } catch (error: any) {
      console.error('Gemini API Error in generateTemplate:', error?.message || error);
      throw new Error(`AI Generation failed: ${error?.message || 'Unknown error'}`);
    }
  },

  async generateRiskSummary(req: AIRiskSummaryRequest): Promise<AIRiskSummaryResult> {
    const prompt = `You are a trust advisor for Pakka Deal — 
a Pakistani escrow platform. Write a plain-language risk 
summary for a potential buyer considering a deal with 
this counterparty.

Write like a trusted Pakistani friend giving honest advice.
Use simple language. No jargon.

Counterparty data:
- Pakka Score: ${req.pakkaScore} / 1000
- Deals completed: ${req.dealsCompleted}
- Deals defaulted: ${req.dealsDefaulted}
- Average deal value: ₨${req.avgDealValuePkr.toLocaleString()}
- Deal being considered: ${req.dealContext}

Return ONLY valid raw JSON. No explanation, no markdown, no conversational text.
{
  "riskLevel": "LOW",
  "summary": "2-3 sentence plain language summary about this counterparty",
  "greenFlags": ["positive thing 1", "positive thing 2"],
  "yellowFlags": ["concern 1 if any"],
  "recommendation": "One clear actionable sentence for the buyer"
}

riskLevel rules:
- LOW: score > 600, default rate < 10%, 5+ deals
- MEDIUM: score 300-600 OR some defaults OR few deals  
- HIGH: score < 300 OR default rate > 20%
- CRITICAL: more defaults than completions`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return safeParseJSON<AIRiskSummaryResult>(text);
  },

  async analyzeDispute(params: {
    dealType: string;
    dealTitle: string;
    amountPkr: number;
    buyerClaim: string;
    sellerClaim: string;
    buyerEvidence: string; // IPFS CID
    sellerEvidence: string; // IPFS CID
  }): Promise<{
    recommendation: string;
    buyerStrength: string;
    sellerStrength: string;
    suggestedVerdict: string;
    reasoning: string;
  }> {
    const prompt = `You are an impartial dispute analyst for Pakka Deal — 
a Pakistani escrow platform. Analyze this dispute and 
provide guidance to arbitrators.

Deal: ${params.dealTitle} (${params.dealType})
Amount: ₨${params.amountPkr.toLocaleString()}

Buyer claims: ${params.buyerClaim}
Buyer evidence IPFS: ${params.buyerEvidence || 'Not submitted'}

Seller claims: ${params.sellerClaim}  
Seller evidence IPFS: ${params.sellerEvidence || 'Not submitted'}

Return ONLY valid raw JSON. No explanation, no markdown, no conversational text.
{
  "recommendation": "What arbitrators should focus on",
  "buyerStrength": "STRONG / MODERATE / WEAK",
  "sellerStrength": "STRONG / MODERATE / WEAK",
  "suggestedVerdict": "BUYER / SELLER / SPLIT",
  "reasoning": "2-3 sentence impartial analysis"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return safeParseJSON<any>(text);
  },
};
