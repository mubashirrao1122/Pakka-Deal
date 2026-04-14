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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
    const prompt = `SYSTEM: You are a JSON-only API. You MUST respond with a single raw JSON object. 
Do NOT wrap it in markdown code fences (\`\`\`). Do NOT include any text, explanation, or commentary before or after the JSON.

ROLE: You are a deal assistant for Pakka Deal — a Pakistani escrow platform.
Extract deal structure from the user's description. The user may write in English, Urdu, 
or Roman Urdu (Urdu written in English letters).

User description: "${req.description}"

Available deal types: 
CAR, PROPERTY, FREELANCE, PSL_FRANCHISE, PSL_PLAYER, 
MARKETPLACE, CUSTOM

Milestone rules:
- CAR / MARKETPLACE: 1 milestone (full payment on delivery)
- PROPERTY: 3 milestones (advance 10-20%, transfer 30-50%, handover remaining)
- FREELANCE: 2-3 milestones (deposit, progress, final delivery)
- PSL_FRANCHISE: 3 milestones (bid 30%, PCB approval 40%, season start 30%)
- CUSTOM: use your judgment based on description

Grace period rules:
- CAR / MARKETPLACE: 48 hours
- FREELANCE: 72 hours per milestone
- PROPERTY: 168 hours (7 days) per milestone
- PSL_FRANCHISE: 720 hours (30 days) per milestone

REQUIRED OUTPUT — exactly this JSON shape, nothing else:
{
  "dealType": "PROPERTY",
  "title": "Short descriptive title in English (max 60 chars)",
  "milestones": [
    { "label": "Advance Payment", "percent": 10 },
    { "label": "Registry Transfer", "percent": 40 },
    { "label": "Physical Handover", "percent": 50 }
  ],
  "gracePeriodHours": 168,
  "suggestedCollateralPct": 22,
  "detectedLanguage": "roman_urdu"
}

RULES:
- dealType must be one of: CAR, PROPERTY, FREELANCE, PSL_FRANCHISE, PSL_PLAYER, MARKETPLACE, CUSTOM
- milestones[].percent values MUST sum to exactly 100
- detectedLanguage must be one of: "english", "urdu", "roman_urdu"
- Output ONLY the JSON object. No markdown. No explanation.`;

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
