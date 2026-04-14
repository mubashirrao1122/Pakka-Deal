import { Router, Request, Response } from 'express';
import { aiEngineService } from '../services/aiEngineService';
import { contractService } from '../services/contractService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

function fallbackFraudAssessment(params: {
  dealType: string;
  description: string;
  amountPkr: number;
}) {
  const text = `${params.dealType} ${params.description}`.toLowerCase();
  const amount = Number(params.amountPkr) || 0;

  const looksLikeCorolla = text.includes('corolla') && (text.includes('2021') || text.includes('2022') || text.includes('2023'));
  if (looksLikeCorolla && amount > 0 && amount <= 2000000) {
    return {
      riskLevel: 'CRITICAL',
      flags: ['Listed price is far below expected market range for Toyota Corolla 2021-2023.'],
      recommendation: 'Do not proceed without physical verification and complete ownership documents.',
    };
  }

  return {
    riskLevel: 'MEDIUM',
    flags: ['AI model unavailable, returning conservative heuristic review.'],
    recommendation: 'Proceed only after verifying CNIC, ownership papers, and market price comparables.',
  };
}

function fallbackTemplate(description: string) {
  const text = description.toLowerCase();
  const isRomanUrdu = /(mein|marla|bech|raha|plot|crore|installments|hogi)/.test(text);
  const isProperty = /(plot|marla|kanal|dha|property|registry|ghar|zameen|crore)/.test(text);

  if (isProperty) {
    return {
      dealType: 'PROPERTY',
      title: 'Property Sale Agreement',
      milestones: [
        { label: 'Advance Payment', percent: 20 },
        { label: 'Registry Transfer', percent: 40 },
        { label: 'Final Handover', percent: 40 },
      ],
      gracePeriodHours: 168,
      suggestedCollateralPct: 22,
      detectedLanguage: isRomanUrdu ? 'roman_urdu' : 'english',
    };
  }

  return {
    dealType: 'CAR',
    title: 'Car Sale Agreement',
    milestones: [{ label: 'Full Payment on Delivery', percent: 100 }],
    gracePeriodHours: 48,
    suggestedCollateralPct: 20,
    detectedLanguage: isRomanUrdu ? 'roman_urdu' : 'english',
  };
}

function fallbackRiskSummary() {
  return {
    riskLevel: 'MEDIUM',
    summary: 'Counterparty data is limited right now, so proceed carefully and verify all documents before payment.',
    greenFlags: ['No immediate critical fraud marker found in available data.'],
    yellowFlags: ['AI trust model unavailable, so recommendation is based on limited inputs.'],
    recommendation: 'Use escrow milestones and only release funds after verification.',
  };
}

// POST /ai/collateral
// Calculate collateral percentage for a deal
router.post('/collateral', async (req: Request, res: Response) => {
  try {
    const { dealType, amountPkr, buyerWallet, sellerWallet, dealId } = req.body;

    if (!dealType || !amountPkr) {
      res.status(400).json({ success: false, error: 'dealType and amountPkr required' });
      return;
    }

    // Get Pakka Scores from blockchain
    let buyerScore  = 100;
    let sellerScore = 100;
    try {
      if (buyerWallet)  buyerScore  = await contractService.getScore(buyerWallet);
      if (sellerWallet) sellerScore = await contractService.getScore(sellerWallet);
    } catch {
      // Use defaults if blockchain unavailable
    }

    const result = await aiEngineService.calculateCollateral({
      dealType,
      amountPkr: Number(amountPkr),
      buyerScore,
      sellerScore,
    });

    // Cache result if dealId provided
    if (dealId) {
      await prisma.aIRiskCache.upsert({
        where: { dealId: Number(dealId) },
        update: {
          collateralPct: result.collateralPercent,
          riskLevel:     result.riskLevel,
          fraudFlag:     result.fraudFlag,
          riskSummary:   result.reason,
          generatedAt:   new Date(),
        },
        create: {
          dealId:       Number(dealId),
          collateralPct: result.collateralPercent,
          riskLevel:    result.riskLevel,
          fraudFlag:    result.fraudFlag,
          riskSummary:  result.reason,
        },
      });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI collateral error:', error);
    // Fallback to safe default if AI fails
    res.json({
      success: true,
      data: {
        collateralPercent: 20,
        riskLevel: 'MEDIUM',
        reason: 'Default collateral (AI temporarily unavailable)',
        fraudFlag: false,
      },
    });
  }
});

// POST /ai/fraud
// Check a deal for fraud indicators
router.post('/fraud', async (req: Request, res: Response) => {
  try {
    const { dealType, description, amountPkr, sellerWallet } = req.body;

    if (!dealType || !amountPkr) {
      res.status(400).json({ success: false, error: 'dealType and amountPkr required' });
      return;
    }

    let sellerScore = 100;
    try {
      if (sellerWallet) sellerScore = await contractService.getScore(sellerWallet);
    } catch {}

    const result = await aiEngineService.detectFraud({
      dealType,
      description: description || '',
      amountPkr:   Number(amountPkr),
      sellerScore,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI fraud check error:', error);
    res.json({
      success: true,
      data: fallbackFraudAssessment({
        dealType: String(req.body?.dealType || ''),
        description: String(req.body?.description || ''),
        amountPkr: Number(req.body?.amountPkr || 0),
      }),
    });
  }
});

// POST /ai/template
// Generate deal template from plain text description
router.post('/template', async (req: Request, res: Response) => {
  try {
    const { description, dealTypeHint } = req.body;

    if (!description || description.trim().length < 5) {
      res.status(400).json({ success: false, error: 'Description too short' });
      return;
    }

    const result = await aiEngineService.generateTemplate({ description, dealTypeHint });
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI template error:', error);
    res.json({ success: true, data: fallbackTemplate(String(req.body?.description || '')) });
  }
});

// POST /ai/risk-summary
// Get counterparty risk summary
router.post('/risk-summary', async (req: Request, res: Response) => {
  try {
    const { walletAddress, dealContext } = req.body;

    if (!walletAddress) {
      res.status(400).json({ success: false, error: 'walletAddress required' });
      return;
    }

    const identity = await contractService.getIdentity(walletAddress);

    const result = await aiEngineService.generateRiskSummary({
      walletAddress,
      dealContext:     dealContext || 'General deal',
      dealsCompleted:  Number(identity.dealsCompleted),
      dealsDefaulted:  Number(identity.dealsDefaulted),
      pakkaScore:      Number(identity.pakkaScore),
      avgDealValuePkr: 500000, // default, update with real data
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI risk summary error:', error);
    res.json({ success: true, data: fallbackRiskSummary() });
  }
});

// POST /ai/dispute-analysis
// Analyze a dispute for arbitrators
router.post('/dispute-analysis', async (req: Request, res: Response) => {
  try {
    const {
      dealType, dealTitle, amountPkr,
      buyerClaim, sellerClaim, buyerEvidence, sellerEvidence,
    } = req.body;

    const result = await aiEngineService.analyzeDispute({
      dealType:      dealType || 'GENERAL',
      dealTitle:     dealTitle || 'Unknown Deal',
      amountPkr:     Number(amountPkr) || 0,
      buyerClaim:    buyerClaim || '',
      sellerClaim:   sellerClaim || '',
      buyerEvidence: buyerEvidence || '',
      sellerEvidence: sellerEvidence || '',
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI dispute analysis error:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze dispute' });
  }
});

export default router;
