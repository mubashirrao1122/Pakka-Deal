import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ipfsService } from '../services/ipfsService';
import { PrismaClient } from '@prisma/client';

const router  = Router();
const prisma  = new PrismaClient();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /ipfs/upload
// Upload a file to IPFS
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided' });
      return;
    }

    const { dealId, party } = req.body;
    const cid = await ipfsService.uploadBuffer(req.file.buffer, req.file.originalname);

    // Store in database
    await prisma.iPFSFile.create({
      data: {
        cid,
        dealId:     dealId ? Number(dealId) : null,
        fileType:   req.file.mimetype,
        fileName:   req.file.originalname,
        uploadedBy: party || null,
        pinned:     true,
      },
    });

    res.json({
      success: true,
      data: {
        cid,
        gatewayUrl: ipfsService.getGatewayUrl(cid),
        fileName:   req.file.originalname,
      },
    });
  } catch (error: any) {
    console.error('IPFS upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

// POST /ipfs/upload-json
// Upload JSON to IPFS
router.post('/upload-json', async (req: Request, res: Response) => {
  try {
    const { data, name } = req.body;
    if (!data || !name) {
      res.status(400).json({ success: false, error: 'data and name required' });
      return;
    }

    const cid = await ipfsService.uploadJSON(data, name);

    res.json({
      success: true,
      data: {
        cid,
        gatewayUrl: ipfsService.getGatewayUrl(cid),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /ipfs/:cid
// Get info about a pinned CID
router.get('/:cid', async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    const pinned  = await ipfsService.isPinned(cid);

    res.json({
      success: true,
      data: {
        cid,
        pinned,
        gatewayUrl: ipfsService.getGatewayUrl(cid),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
