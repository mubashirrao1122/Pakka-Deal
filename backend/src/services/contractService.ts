import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const ABIS_DIR     = path.join(__dirname, '../../../abis');
const DEPLOYED     = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../deployed.json'), 'utf-8')
);

function loadABI(contractName: string): any[] {
  const filePath = path.join(ABIS_DIR, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const provider = new ethers.JsonRpcProvider(process.env.WIREFLUID_RPC_URL);

function getRelayerWallet(): ethers.Wallet {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk || pk.trim() === '') {
    throw new Error('RELAYER_PRIVATE_KEY is not configured in .env');
  }
  return new ethers.Wallet(pk, provider);
}

const escrowVaultReadOnly = new ethers.Contract(
  DEPLOYED.escrowVault,
  loadABI('EscrowVault'),
  provider
);

function getEscrowVaultSigner() {
  return new ethers.Contract(DEPLOYED.escrowVault, loadABI('EscrowVault'), getRelayerWallet());
}

const didRegistryReadOnly = new ethers.Contract(
  DEPLOYED.didRegistry,
  loadABI('DIDRegistry'),
  provider
);

function getDidRegistrySigner() {
  return new ethers.Contract(DEPLOYED.didRegistry, loadABI('DIDRegistry'), getRelayerWallet());
}

function getAiAgentSigner() {
  return new ethers.Contract(DEPLOYED.aiAgentInterface, loadABI('AIAgentInterface'), getRelayerWallet());
}

export const contractService = {

  // ── Deal functions ──

  async createDeal(params: {
    sellerAddress:     string;
    dealType:          number;
    totalAmountWei:    string;
    collateralPercent: number;
    milestoneLabels:   string[];
    milestoneAmounts:  string[];
  }): Promise<{ txHash: string; dealId: number }> {

    // ABI: createDeal(uint8 _dealType, uint256 _totalAmount, uint256 _collateralPercent,
    //                 string[] _milestoneLabels, uint256[] _milestoneAmounts) payable
    // seller = msg.sender (the relayer wallet), sellerBond sent as msg.value
    const totalAmount = BigInt(params.totalAmountWei);
    const sellerBond  = (totalAmount * BigInt(params.collateralPercent)) / 100n;

    const tx = await getEscrowVaultSigner().createDeal(
      params.dealType,
      totalAmount,
      params.collateralPercent,
      params.milestoneLabels,
      params.milestoneAmounts.map((a) => BigInt(a)),
      { value: sellerBond }  // payable: send seller bond as ETH
    );

    const receipt = await tx.wait();

    // Parse the DealCreated event to get the dealId
    let dealId = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = escrowVaultReadOnly.interface.parseLog(log);
        if (parsed && parsed.name === 'DealCreated') {
          dealId = Number(parsed.args[0]);
          break;
        }
      } catch {
        // skip unparseable logs
      }
    }

    return { txHash: receipt.hash, dealId };
  },

  async getDeal(dealId: number): Promise<any> {
    return escrowVaultReadOnly.getDeal(dealId);
  },

  async getMilestones(dealId: number): Promise<any[]> {
    return escrowVaultReadOnly.getMilestones(dealId);
  },

  async joinAndLockFunds(params: {
    dealId: number;
    buyerAddress: string;
    totalAmountWei: string;
  }): Promise<string> {
    const tx = await getEscrowVaultSigner().joinAndLockFunds(
      params.dealId,
      params.buyerAddress,
      { value: BigInt(params.totalAmountWei) }
    );
    const receipt = await tx.wait();
    return receipt.hash;
  },

  async confirmMilestone(dealId: number): Promise<string> {
    const tx = await getEscrowVaultSigner().confirmMilestone(dealId);
    const receipt = await tx.wait();
    return receipt.hash;
  },

  async totalDeals(): Promise<number> {
    const count = await escrowVaultReadOnly.totalDeals();
    return Number(count);
  },

  // ── Identity functions ──

  async registerDID(
    walletAddress: string,
    nullifierHash: bigint
  ): Promise<string> {
    // Relayer registers DID on behalf of user
    const tx = await getDidRegistrySigner().registerDID(nullifierHash);
    const receipt = await tx.wait();
    return receipt.hash;
  },

  async getScore(walletAddress: string): Promise<number> {
    const score = await didRegistryReadOnly.getScore(walletAddress);
    return Number(score);
  },

  async getIdentity(walletAddress: string): Promise<any> {
    return didRegistryReadOnly.getIdentity(walletAddress);
  },

  async isVerified(walletAddress: string): Promise<boolean> {
    return didRegistryReadOnly.isVerified(walletAddress);
  },

  async getTier(walletAddress: string): Promise<string> {
    return didRegistryReadOnly.getTier(walletAddress);
  },

  // ── AI Agent functions ──

  async fulfillCollateral(
    dealId:            number,
    collateralPercent: number,
    riskLevel:         number,
    fraudFlag:         boolean,
    riskSummary:       string
  ): Promise<string> {
    const tx = await getAiAgentSigner().fulfillCollateral(
      dealId,
      collateralPercent,
      riskLevel,
      fraudFlag,
      riskSummary
    );
    const receipt = await tx.wait();
    return receipt.hash;
  },

  async fulfillTemplate(
    requestId:              number,
    dealType:               string,
    title:                  string,
    suggestedCollateralPct: number,
    gracePeriodHours:       number
  ): Promise<string> {
    const tx = await getAiAgentSigner().fulfillTemplate(
      requestId,
      dealType,
      title,
      suggestedCollateralPct,
      gracePeriodHours
    );
    const receipt = await tx.wait();
    return receipt.hash;
  },

  // ── Utility ──

  getRelayerAddress(): string {
    return getRelayerWallet().address;
  },

  async getRelayerBalance(): Promise<string> {
    const wallet = getRelayerWallet();
    const balance = await provider.getBalance(wallet.address);
    return ethers.formatEther(balance);
  },

  async getContractAddresses() {
    return {
      escrowVault:      DEPLOYED.escrowVault,
      didRegistry:      DEPLOYED.didRegistry,
      aiAgentInterface: DEPLOYED.aiAgentInterface,
      forwarder:        DEPLOYED.forwarder,
    };
  },

  // ── Event listener for AI agent requests ──
  listenForCollateralRequests(
    callback: (dealId: number, amountWei: bigint, buyerScore: number, sellerScore: number) => void
  ) {
    escrowVaultReadOnly.on(
      'CollateralRequested',
      (dealId, amountWei, buyerScore, sellerScore) => {
        callback(Number(dealId), amountWei, Number(buyerScore), Number(sellerScore));
      }
    );
    console.log('Listening for CollateralRequested events...');
  },
};
