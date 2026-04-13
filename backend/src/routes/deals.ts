import { Router, Request, Response } from 'express';
import { contractService } from '../services/contractService';
import { ipfsService } from '../services/ipfsService';
import { aiEngineService } from '../services/aiEngineService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /deals
// Create a new deal (relayer pays gas)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      sellerAddress, dealType, totalAmountWei,
      collateralPercent, milestoneLabels, milestoneAmounts,
      title, amountPkr, buyerWallet,
    } = req.body;

    // Validate required fields
    if (!sellerAddress || !totalAmountWei || !milestoneLabels || !milestoneAmounts) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    if (milestoneLabels.length !== milestoneAmounts.length) {
      res.status(400).json({ success: false, error: 'Milestone labels and amounts must match' });
      return;
    }

    // Create deal on-chain via relayer
    const { txHash, dealId } = await contractService.createDeal({
      sellerAddress,
      dealType:          Number(dealType) || 0,
      totalAmountWei,
      collateralPercent: Number(collateralPercent) || 20,
      milestoneLabels,
      milestoneAmounts,
    });

    // Store metadata on IPFS
    let metadataCid: string | null = null;
    try {
      metadataCid = await ipfsService.storeDealMetadata({
        dealId,
        title:        title || `Deal #${dealId}`,
        dealType:     String(dealType),
        amountPkr:    Number(amountPkr) || 0,
        buyerWallet:  buyerWallet || '',
        sellerWallet: sellerAddress,
        milestones:   milestoneLabels.map((label: string, i: number) => ({
          label,
          amountWei: milestoneAmounts[i],
        })),
        createdAt: new Date().toISOString(),
      });
    } catch (ipfsError) {
      console.error('IPFS metadata storage failed:', ipfsError);
      // Non-fatal: deal is on-chain, IPFS is optional
    }

    // Cache in database
    await prisma.dealCache.create({
      data: {
        dealId,
        metadataCid,
        title:         title || `Deal #${dealId}`,
        dealType:      String(dealType),
        amountPkr:     BigInt(amountPkr || 0),
        buyerWallet,
        sellerWallet:  sellerAddress,
        currentState:  'PENDING',
        milestoneCount: milestoneLabels.length,
      },
    });

    res.json({
      success: true,
      data: { dealId, txHash, metadataCid },
    });
  } catch (error: any) {
    console.error('Create deal error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /deals/:id
// Get deal details (on-chain + cached metadata)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(String(req.params.id));
    if (isNaN(dealId)) {
      res.status(400).json({ success: false, error: 'Invalid deal ID' });
      return;
    }

    const [onChain, milestones, cached, aiCache] = await Promise.allSettled([
      contractService.getDeal(dealId),
      contractService.getMilestones(dealId),
      prisma.dealCache.findUnique({ where: { dealId } }),
      prisma.aIRiskCache.findUnique({ where: { dealId } }),
    ]);

    res.json({
      success: true,
      data: {
        onChain:    onChain.status    === 'fulfilled' ? onChain.value    : null,
        milestones: milestones.status === 'fulfilled' ? milestones.value : [],
        cached:     cached.status     === 'fulfilled' ? cached.value     : null,
        aiRisk:     aiCache.status    === 'fulfilled' ? aiCache.value    : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /deals/wallet/:address
// Get all deals for a wallet address
router.get('/wallet/:address', async (req: Request, res: Response) => {
  try {
    const address = String(req.params.address);
    const deals = await prisma.dealCache.findMany({
      where: {
        OR: [
          { buyerWallet:  address },
          { sellerWallet: address },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: deals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /deals
// Get all deals (for marketplace)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, state, limit = '20', offset = '0' } = req.query;

    const where: any = {};
    if (type)  where.dealType     = String(type);
    if (state) where.currentState = String(state);

    const deals = await prisma.dealCache.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    parseInt(String(limit)),
      skip:    parseInt(String(offset)),
    });

    const total = await prisma.dealCache.count({ where });

    res.json({ success: true, data: { deals, total } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /deals/:id/state
// Update cached deal state (called after on-chain events)
router.patch('/:id/state', async (req: Request, res: Response) => {
  try {
    const dealId = parseInt(String(req.params.id));
    const { state, currentMilestone } = req.body;

    const updated = await prisma.dealCache.update({
      where: { dealId },
      data: {
        currentState:     state,
        currentMilestone: currentMilestone !== undefined ? Number(currentMilestone) : undefined,
        lastSynced:       new Date(),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
