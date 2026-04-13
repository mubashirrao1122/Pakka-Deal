import PinataClient from '@pinata/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

const pinata = new PinataClient(
  process.env.PINATA_API_KEY!,
  process.env.PINATA_API_SECRET!
);

export const ipfsService = {

  async testConnection(): Promise<boolean> {
    try {
      await pinata.testAuthentication();
      return true;
    } catch {
      return false;
    }
  },

  // Upload a JSON object to IPFS
  async uploadJSON(data: object, name: string): Promise<string> {
    const result = await pinata.pinJSONToIPFS(data, {
      pinataMetadata: { name },
      pinataOptions:  { cidVersion: 1 },
    });
    return result.IpfsHash;
  },

  // Upload a file buffer to IPFS
  async uploadBuffer(
    buffer:   Buffer,
    filename: string
  ): Promise<string> {
    const stream = Readable.from(buffer);
    // Pinata needs a .path property on the stream
    (stream as any).path = filename;

    const result = await pinata.pinFileToIPFS(stream, {
      pinataMetadata: { name: filename },
      pinataOptions:  { cidVersion: 1 },
    });
    return result.IpfsHash;
  },

  // Store deal metadata — called when deal is created
  async storeDealMetadata(deal: {
    dealId:       number;
    title:        string;
    dealType:     string;
    amountPkr:    number;
    buyerWallet:  string;
    sellerWallet: string;
    milestones:   { label: string; amountWei: string }[];
    createdAt:    string;
  }): Promise<string> {
    return this.uploadJSON(
      {
        ...deal,
        platform:   'Pakka Deal',
        blockchain: 'WireFluid',
        version:    '1.0.0',
      },
      `pakka-deal-${deal.dealId}-metadata`
    );
  },

  // Store dispute evidence reference
  async storeEvidenceMetadata(evidence: {
    dealId:     number;
    party:      'buyer' | 'seller';
    fileCount:  number;
    fileCIDs:   string[];
    submittedAt: string;
  }): Promise<string> {
    return this.uploadJSON(
      evidence,
      `pakka-deal-${evidence.dealId}-evidence-${evidence.party}`
    );
  },

  // Get public gateway URL for any CID
  getGatewayUrl(cid: string): string {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  },

  // Fetch JSON from IPFS by CID
  async fetchJSON(cid: string): Promise<any> {
    const url = this.getGatewayUrl(cid);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch IPFS content: ${response.statusText}`);
    }
    return response.json();
  },

  // Check if a CID is pinned
  async isPinned(cid: string): Promise<boolean> {
    try {
      const result = await pinata.pinList({ hashContains: cid });
      return result.rows.length > 0;
    } catch {
      return false;
    }
  },
};
