import { Router, Request, Response } from 'express';
import { contractService } from '../services/contractService';
import { ipfsService } from '../services/ipfsService';
import { PrismaClient } from '@prisma/client';

const router  = Router();
const prisma  = new PrismaClient();

router.get('/', async (req: Request, res: Response) => {
  try {
    const [
      relayerBalance,
      contractAddresses,
      ipfsConnected,
    ] = await Promise.allSettled([
      contractService.getRelayerBalance(),
      contractService.getContractAddresses(),
      ipfsService.testConnection(),
    ]);

    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {}

    res.json({
      status:    'ok',
      timestamp:  new Date().toISOString(),
      services: {
        blockchain: {
          status:          relayerBalance.status === 'fulfilled' ? 'connected' : 'error',
          relayerBalance:  relayerBalance.status === 'fulfilled' ? relayerBalance.value : null,
          relayerAddress:  contractService.getRelayerAddress(),
          contracts:       contractAddresses.status === 'fulfilled' ? contractAddresses.value : null,
        },
        ipfs: {
          status: (ipfsConnected.status === 'fulfilled' && ipfsConnected.value) ? 'connected' : 'error',
        },
        database: {
          status: dbConnected ? 'connected' : 'error',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router;
