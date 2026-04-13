import { Router, Request, Response } from 'express';
import { contractService } from '../services/contractService';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// POST /users/register
// Register a new user (creates DB record + registers DID on-chain)
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { walletAddress, phoneNumber, cnicHash, displayName } = req.body;

    if (!walletAddress) {
      res.status(400).json({ success: false, error: 'walletAddress required' });
      return;
    }

    // Upsert user in database
    const user = await prisma.user.upsert({
      where:  { walletAddress },
      update: { phoneNumber, displayName },
      create: { walletAddress, phoneNumber, cnicHash, displayName },
    });

    // Register DID on-chain if cnicHash provided
    let txHash: string | null = null;
    if (cnicHash) {
      try {
        // Convert cnicHash string to bigint for on-chain storage
        const nullifier = BigInt('0x' + cnicHash.replace(/-/g, '').substring(0, 16));
        txHash = await contractService.registerDID(walletAddress, nullifier);
      } catch (err: any) {
        // If already registered on-chain, that is fine
        if (!err.message?.includes('Already registered')) {
          console.error('DID registration error:', err.message);
        }
      }
    }

    const score = await contractService.getScore(walletAddress);
    const tier  = await contractService.getTier(walletAddress);

    res.json({
      success: true,
      data: {
        user,
        onChain: { score, tier, txHash },
      },
    });
  } catch (error: any) {
    console.error('User register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /users/:wallet
// Get full user profile
router.get('/:wallet', async (req: Request, res: Response) => {
  try {
    const wallet = String(req.params.wallet);

    const [dbUser, onChainIdentity, tier] = await Promise.allSettled([
      prisma.user.findUnique({ where: { walletAddress: wallet } }),
      contractService.getIdentity(wallet),
      contractService.getTier(wallet),
    ]);

    res.json({
      success: true,
      data: {
        profile:  dbUser.status  === 'fulfilled' ? dbUser.value  : null,
        identity: onChainIdentity.status === 'fulfilled' ? {
          pakkaScore:      Number(onChainIdentity.value.pakkaScore),
          dealsCompleted:  Number(onChainIdentity.value.dealsCompleted),
          dealsDefaulted:  Number(onChainIdentity.value.dealsDefaulted),
          dealsDisputed:   Number(onChainIdentity.value.dealsDisputed),
          verified:        onChainIdentity.value.verified,
          registeredAt:    Number(onChainIdentity.value.registeredAt),
          tier:            tier.status === 'fulfilled' ? tier.value : 'NEW_USER',
        } : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /users/:wallet/score
// Get just the score and tier
router.get('/:wallet/score', async (req: Request, res: Response) => {
  try {
    const wallet = String(req.params.wallet);
    const [score, tier] = await Promise.all([
      contractService.getScore(wallet),
      contractService.getTier(wallet),
    ]);
    res.json({ success: true, data: { score, tier } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
