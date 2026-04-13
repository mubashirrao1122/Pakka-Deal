import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Pakka Deal — Full Test Suite", () => {

  let forwarder:    any;
  let didRegistry:  any;
  let escrowVault:  any;
  let aiAgent:      any;

  let owner:   any;
  let buyer:   any;
  let seller:  any;
  let arb1:    any;
  let arb2:    any;
  let arb3:    any;
  let stranger: any;

  const ONE_ETH  = ethers.parseEther("1");
  const TWO_ETH  = ethers.parseEther("2");

  beforeEach(async () => {
    [owner, buyer, seller, arb1, arb2, arb3, stranger] = await ethers.getSigners();

    // Deploy forwarder
    const Forwarder = await ethers.getContractFactory("PakkaDealForwarder");
    forwarder = await Forwarder.deploy();
    await forwarder.waitForDeployment();

    // Deploy DIDRegistry
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    didRegistry = await DIDRegistry.deploy();
    await didRegistry.waitForDeployment();

    // Deploy EscrowVault
    const EscrowVault = await ethers.getContractFactory("EscrowVault");
    escrowVault = await EscrowVault.deploy(
      await forwarder.getAddress(),
      await didRegistry.getAddress()
    );
    await escrowVault.waitForDeployment();

    // Deploy AIAgentInterface
    const AIAgent = await ethers.getContractFactory("AIAgentInterface");
    aiAgent = await AIAgent.deploy();
    await aiAgent.waitForDeployment();

    // Link DIDRegistry to EscrowVault
    await didRegistry.setEscrowVault(await escrowVault.getAddress());

    // Set AI relayer
    await aiAgent.setAIRelayer(owner.address);

    // Register both parties in DIDRegistry
    await didRegistry.connect(buyer).registerDID(11111);
    await didRegistry.connect(seller).registerDID(22222);
  });

  // ════════════════════════════════════════════════
  // SECTION 1: DIDRegistry Tests
  // ════════════════════════════════════════════════

  describe("DIDRegistry", () => {

    it("registers a user and assigns score 100", async () => {
      const id = await didRegistry.getIdentity(buyer.address);
      expect(id.verified).to.equal(true);
      expect(id.pakkaScore).to.equal(100);
      expect(id.dealsCompleted).to.equal(0);
    });

    it("returns correct tier for each score range", async () => {
      expect(await didRegistry.getTier(buyer.address)).to.equal("NEW_USER");
    });

    it("prevents the same nullifier registering twice", async () => {
      await expect(
        didRegistry.connect(stranger).registerDID(11111)
      ).to.be.revertedWith("CNIC already registered to another wallet");
    });

    it("prevents registering twice on same wallet", async () => {
      await expect(
        didRegistry.connect(buyer).registerDID(99999)
      ).to.be.revertedWith("Already registered");
    });

    it("rejects zero nullifier", async () => {
      await expect(
        didRegistry.connect(stranger).registerDID(0)
      ).to.be.revertedWith("Invalid nullifier");
    });

    it("only EscrowVault can increment score", async () => {
      await expect(
        didRegistry.connect(stranger).incrementScore(buyer.address)
      ).to.be.revertedWith("Only EscrowVault can call this");
    });

    it("only EscrowVault can decrement score", async () => {
      await expect(
        didRegistry.connect(stranger).decrementScore(buyer.address)
      ).to.be.revertedWith("Only EscrowVault can call this");
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 2: Deal Creation Tests
  // ════════════════════════════════════════════════

  describe("createDeal", () => {

    it("creates a single-milestone car deal", async () => {
      await escrowVault.connect(buyer).createDeal(
        seller.address,
        0, // CAR
        ONE_ETH,
        20, // 20% collateral
        ["Full Payment"],
        [ONE_ETH]
      );

      const deal = await escrowVault.getDeal(0);
      expect(deal.buyer).to.equal(buyer.address);
      expect(deal.seller).to.equal(seller.address);
      expect(deal.totalAmount).to.equal(ONE_ETH);
      expect(deal.sellerBond).to.equal(ONE_ETH / 5n); // 20%
      expect(deal.milestoneCount).to.equal(1);
      expect(deal.state).to.equal(0); // PENDING
    });

    it("creates a 3-milestone property deal", async () => {
      const total = ethers.parseEther("3");
      await escrowVault.connect(buyer).createDeal(
        seller.address,
        1, // PROPERTY
        total,
        20,
        ["Advance", "Registry Transfer", "Handover"],
        [
          ethers.parseEther("0.3"),
          ethers.parseEther("1.2"),
          ethers.parseEther("1.5")
        ]
      );

      const ms = await escrowVault.getMilestones(0);
      expect(ms.length).to.equal(3);
      expect(ms[0].label).to.equal("Advance");
      expect(ms[1].label).to.equal("Registry Transfer");
      expect(ms[2].label).to.equal("Handover");
    });

    it("rejects if milestones do not sum to total", async () => {
      await expect(
        escrowVault.connect(buyer).createDeal(
          seller.address, 0, ONE_ETH, 20,
          ["Payment"], [ethers.parseEther("0.5")]
        )
      ).to.be.revertedWith("Milestones must sum to totalAmount");
    });

    it("rejects buyer and seller being same address", async () => {
      await expect(
        escrowVault.connect(buyer).createDeal(
          buyer.address, 0, ONE_ETH, 20,
          ["Payment"], [ONE_ETH]
        )
      ).to.be.revertedWith("Buyer and seller cannot be same");
    });

    it("rejects 0 total amount", async () => {
      await expect(
        escrowVault.connect(buyer).createDeal(
          seller.address, 0, 0, 20,
          ["Payment"], [0]
        )
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("rejects more than 4 milestones", async () => {
      await expect(
        escrowVault.connect(buyer).createDeal(
          seller.address, 0, 
          ethers.parseEther("5"), 20,
          ["a","b","c","d","e"],
          [ONE_ETH, ONE_ETH, ONE_ETH, ONE_ETH, ONE_ETH]
        )
      ).to.be.revertedWith("1-4 milestones only");
    });

    it("increments dealCounter on each creation", async () => {
      await escrowVault.connect(buyer).createDeal(
        seller.address, 0, ONE_ETH, 20, ["P"], [ONE_ETH]
      );
      await escrowVault.connect(buyer).createDeal(
        seller.address, 0, ONE_ETH, 20, ["P"], [ONE_ETH]
      );
      expect(await escrowVault.totalDeals()).to.equal(2);
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 3: Fund Locking Tests
  // ════════════════════════════════════════════════

  describe("Fund Locking", () => {

    beforeEach(async () => {
      await escrowVault.connect(buyer).createDeal(
        seller.address, 0, ONE_ETH, 20, ["Full Payment"], [ONE_ETH]
      );
    });

    it("buyer locks exact amount successfully", async () => {
      await escrowVault.connect(buyer).lockBuyerFunds(0, { value: ONE_ETH });
      const balance = await ethers.provider.getBalance(
        await escrowVault.getAddress()
      );
      expect(balance).to.equal(ONE_ETH);
    });

    it("rejects if buyer sends wrong amount", async () => {
      await expect(
        escrowVault.connect(buyer).lockBuyerFunds(0, {
          value: ethers.parseEther("0.5")
        })
      ).to.be.revertedWith("Must send exact deal amount");
    });

    it("rejects if non-buyer tries to lock buyer funds", async () => {
      await expect(
        escrowVault.connect(seller).lockBuyerFunds(0, { value: ONE_ETH })
      ).to.be.revertedWith("Only buyer can lock funds");
    });

    it("seller locks bond after buyer, deal becomes LOCKED", async () => {
      const bond = ONE_ETH / 5n; // 20%

      await escrowVault.connect(buyer).lockBuyerFunds(0, { value: ONE_ETH });
      await escrowVault.connect(seller).lockSellerBond(0, { value: bond });

      const deal = await escrowVault.getDeal(0);
      expect(deal.state).to.equal(1); // LOCKED
      expect(deal.gracePeriodEnd).to.be.gt(0);
    });

    it("rejects if seller locks bond before buyer", async () => {
      const bond = ONE_ETH / 5n;
      await expect(
        escrowVault.connect(seller).lockSellerBond(0, { value: bond })
      ).to.be.revertedWith("Buyer must lock first");
    });

    it("rejects if seller sends wrong bond amount", async () => {
      await escrowVault.connect(buyer).lockBuyerFunds(0, { value: ONE_ETH });
      await expect(
        escrowVault.connect(seller).lockSellerBond(0, {
          value: ethers.parseEther("0.1")
        })
      ).to.be.revertedWith("Must send exact bond amount");
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 4: Happy Path — Full Deal Completion
  // ════════════════════════════════════════════════

  describe("Happy Path — Single Milestone Deal", () => {

    let dealId: number;

    beforeEach(async () => {
      // Create deal
      const tx = await escrowVault.connect(buyer).createDeal(
        seller.address, 0, ONE_ETH, 20,
        ["Full Payment on Delivery"], [ONE_ETH]
      );
      await tx.wait();
      dealId = 0;

      const bond = ONE_ETH / 5n;
      await escrowVault.connect(buyer).lockBuyerFunds(dealId, { value: ONE_ETH });
      await escrowVault.connect(seller).lockSellerBond(dealId, { value: bond });
    });

    it("buyer can confirm milestone and seller receives payment", async () => {
      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await escrowVault.connect(buyer).confirmMilestone(dealId);

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter).to.be.gt(sellerBefore);

      const deal = await escrowVault.getDeal(dealId);
      expect(deal.state).to.equal(2); // COMPLETED
    });

    it("Pakka Score increases for both buyer and seller after completion", async () => {
      const buyerScoreBefore  = await didRegistry.getScore(buyer.address);
      const sellerScoreBefore = await didRegistry.getScore(seller.address);

      await escrowVault.connect(buyer).confirmMilestone(dealId);

      const buyerScoreAfter  = await didRegistry.getScore(buyer.address);
      const sellerScoreAfter = await didRegistry.getScore(seller.address);

      expect(buyerScoreAfter).to.be.gt(buyerScoreBefore);
      expect(sellerScoreAfter).to.be.gt(sellerScoreBefore);
    });

    it("seller bond is returned on deal completion", async () => {
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await escrowVault.connect(buyer).confirmMilestone(dealId);
      const sellerAfter  = await ethers.provider.getBalance(seller.address);

      // Seller should receive both payment AND bond back
      // Payment = 1 ETH, Bond = 0.2 ETH, total = 1.2 ETH (minus gas)
      const diff = sellerAfter - sellerBefore;
      expect(diff).to.be.gt(ethers.parseEther("1.1")); // at least 1.1 ETH received
    });

    it("only buyer can confirm milestone", async () => {
      await expect(
        escrowVault.connect(seller).confirmMilestone(dealId)
      ).to.be.revertedWith("Only buyer can confirm");
    });

    it("cannot confirm milestone during dispute", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      await expect(
        escrowVault.connect(buyer).confirmMilestone(dealId)
      ).to.be.revertedWith("Cannot confirm during dispute");
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 5: Multi-Milestone Deal
  // ════════════════════════════════════════════════

  describe("Multi-Milestone Property Deal", () => {

    let dealId: number;
    const total    = ethers.parseEther("3");
    const advance  = ethers.parseEther("0.3");
    const transfer = ethers.parseEther("1.2");
    const handover = ethers.parseEther("1.5");
    const bond     = total * 20n / 100n;

    beforeEach(async () => {
      await escrowVault.connect(buyer).createDeal(
        seller.address, 1, total, 20,
        ["Advance", "Registry Transfer", "Handover"],
        [advance, transfer, handover]
      );
      dealId = 0;
      await escrowVault.connect(buyer).lockBuyerFunds(dealId, { value: total });
      await escrowVault.connect(seller).lockSellerBond(dealId, { value: bond });
    });

    it("releases each milestone in sequence", async () => {
      const sellerBalance0 = await ethers.provider.getBalance(seller.address);

      // Milestone 1
      await escrowVault.connect(buyer).confirmMilestone(dealId);
      let deal = await escrowVault.getDeal(dealId);
      expect(deal.currentMilestone).to.equal(1);
      expect(deal.state).to.equal(1); // still LOCKED

      // Milestone 2
      await escrowVault.connect(buyer).confirmMilestone(dealId);
      deal = await escrowVault.getDeal(dealId);
      expect(deal.currentMilestone).to.equal(2);
      expect(deal.state).to.equal(1); // still LOCKED

      // Milestone 3 — final
      await escrowVault.connect(buyer).confirmMilestone(dealId);
      deal = await escrowVault.getDeal(dealId);
      expect(deal.currentMilestone).to.equal(3);
      expect(deal.state).to.equal(2); // COMPLETED

      const sellerBalance1 = await ethers.provider.getBalance(seller.address);
      expect(sellerBalance1).to.be.gt(sellerBalance0);
    });

    it("milestone data shows completed flags correctly", async () => {
      await escrowVault.connect(buyer).confirmMilestone(dealId);

      const ms = await escrowVault.getMilestones(dealId);
      expect(ms[0].completed).to.equal(true);
      expect(ms[1].completed).to.equal(false);
      expect(ms[2].completed).to.equal(false);
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 6: Grace Period and Penalty
  // ════════════════════════════════════════════════

  describe("Grace Period and Penalty", () => {

    let dealId: number;

    beforeEach(async () => {
      await escrowVault.connect(buyer).createDeal(
        seller.address, 0, ONE_ETH, 20,
        ["Full Payment"], [ONE_ETH]
      );
      dealId = 0;
      const bond = ONE_ETH / 5n;
      await escrowVault.connect(buyer).lockBuyerFunds(dealId, { value: ONE_ETH });
      await escrowVault.connect(seller).lockSellerBond(dealId, { value: bond });
    });

    it("cannot apply penalty while grace period is active", async () => {
      await expect(
        escrowVault.connect(stranger).applyPenalty(dealId)
      ).to.be.revertedWith("Grace period not expired");
    });

    it("applies penalty and pays seller after grace period expires", async () => {
      // Fast-forward 73 hours
      await time.increase(73 * 60 * 60);

      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await escrowVault.connect(stranger).applyPenalty(dealId);

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter).to.be.gt(sellerBefore);

      const deal = await escrowVault.getDeal(dealId);
      expect(deal.state).to.equal(3); // DEFAULTED
    });

    it("decrements buyer Pakka Score on penalty", async () => {
      const scoreBefore = await didRegistry.getScore(buyer.address);
      await time.increase(73 * 60 * 60);
      await escrowVault.connect(stranger).applyPenalty(dealId);
      const scoreAfter = await didRegistry.getScore(buyer.address);
      expect(scoreAfter).to.be.lt(scoreBefore);
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 7: Dispute Flow
  // ════════════════════════════════════════════════

  describe("Dispute Resolution", () => {

    let dealId: number;

    beforeEach(async () => {
      await escrowVault.connect(buyer).createDeal(
        seller.address, 0, ONE_ETH, 20,
        ["Full Payment"], [ONE_ETH]
      );
      dealId = 0;
      const bond = ONE_ETH / 5n;
      await escrowVault.connect(buyer).lockBuyerFunds(dealId, { value: ONE_ETH });
      await escrowVault.connect(seller).lockSellerBond(dealId, { value: bond });
    });

    it("buyer can raise a dispute", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      const deal = await escrowVault.getDeal(dealId);
      expect(deal.disputed).to.equal(true);
      expect(deal.state).to.equal(4); // DISPUTED
    });

    it("seller can raise a dispute", async () => {
      await escrowVault.connect(seller).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      const deal = await escrowVault.getDeal(dealId);
      expect(deal.disputed).to.equal(true);
    });

    it("stranger cannot raise dispute", async () => {
      await expect(
        escrowVault.connect(stranger).raiseDispute(
          dealId, arb1.address, arb2.address, arb3.address
        )
      ).to.be.revertedWith("Only deal parties can dispute");
    });

    it("cannot raise dispute twice", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      await expect(
        escrowVault.connect(buyer).raiseDispute(
          dealId, arb1.address, arb2.address, arb3.address
        )
      ).to.be.revertedWith("Already disputed");
    });

    it("buyer and seller can submit IPFS evidence", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );

      await escrowVault.connect(buyer).submitEvidence(dealId, "QmBuyerEvidence123abc");
      await escrowVault.connect(seller).submitEvidence(dealId, "QmSellerEvidence456def");

      const deal = await escrowVault.getDeal(dealId);
      expect(deal.buyerEvidence).to.equal("QmBuyerEvidence123abc");
      expect(deal.sellerEvidence).to.equal("QmSellerEvidence456def");
    });

    it("cannot submit evidence twice for same party", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      await escrowVault.connect(buyer).submitEvidence(dealId, "QmFirst");
      await expect(
        escrowVault.connect(buyer).submitEvidence(dealId, "QmSecond")
      ).to.be.revertedWith("Evidence already submitted");
    });

    it("BUYER wins when 2 of 3 arbitrators vote BUYER", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );

      const buyerBefore = await ethers.provider.getBalance(buyer.address);

      await escrowVault.connect(arb1).submitVote(dealId, 1); // BUYER
      await escrowVault.connect(arb2).submitVote(dealId, 1); // BUYER
      await escrowVault.connect(arb3).submitVote(dealId, 2); // SELLER

      const deal = await escrowVault.getDeal(dealId);
      expect(deal.state).to.equal(5); // CLOSED
      expect(deal.disputed).to.equal(false);

      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerAfter).to.be.gt(buyerBefore);
    });

    it("SELLER wins when 2 of 3 arbitrators vote SELLER", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );

      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await escrowVault.connect(arb1).submitVote(dealId, 2); // SELLER
      await escrowVault.connect(arb2).submitVote(dealId, 2); // SELLER
      await escrowVault.connect(arb3).submitVote(dealId, 1); // BUYER

      const deal = await escrowVault.getDeal(dealId);
      expect(deal.state).to.equal(5); // CLOSED

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter).to.be.gt(sellerBefore);
    });

    it("SPLIT when all 3 vote SPLIT", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );

      const buyerBefore  = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);

      await escrowVault.connect(arb1).submitVote(dealId, 3); // SPLIT
      await escrowVault.connect(arb2).submitVote(dealId, 3); // SPLIT
      await escrowVault.connect(arb3).submitVote(dealId, 3); // SPLIT

      const buyerAfter  = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(buyerAfter).to.be.gt(buyerBefore);
      expect(sellerAfter).to.be.gt(sellerBefore);
    });

    it("non-arbitrator cannot vote", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      await expect(
        escrowVault.connect(stranger).submitVote(dealId, 1)
      ).to.be.revertedWith("Not an assigned arbitrator");
    });

    it("arbitrator cannot vote twice", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      await escrowVault.connect(arb1).submitVote(dealId, 1);
      await expect(
        escrowVault.connect(arb1).submitVote(dealId, 2)
      ).to.be.revertedWith("Already voted");
    });

    it("decrements seller score when buyer wins dispute", async () => {
      await escrowVault.connect(buyer).raiseDispute(
        dealId, arb1.address, arb2.address, arb3.address
      );
      const sellerScoreBefore = await didRegistry.getScore(seller.address);

      await escrowVault.connect(arb1).submitVote(dealId, 1);
      await escrowVault.connect(arb2).submitVote(dealId, 1);
      await escrowVault.connect(arb3).submitVote(dealId, 2);

      const sellerScoreAfter = await didRegistry.getScore(seller.address);
      expect(sellerScoreAfter).to.be.lt(sellerScoreBefore);
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 8: AIAgentInterface Tests
  // ════════════════════════════════════════════════

  describe("AIAgentInterface", () => {

    it("emits event when collateral is requested", async () => {
      await expect(
        aiAgent.connect(buyer).requestCollateral(0, ONE_ETH, 720, 850)
      ).to.emit(aiAgent, "CollateralRequested");
    });

    it("AI relayer can fulfill collateral request", async () => {
      await aiAgent.fulfillCollateral(0, 18, 0, false, "Low risk deal");
      const result = await aiAgent.getRiskResult(0);
      expect(result.collateralPercent).to.equal(18);
      expect(result.riskLevel).to.equal(0); // LOW
      expect(result.fraudFlag).to.equal(false);
    });

    it("non-relayer cannot fulfill collateral", async () => {
      await expect(
        aiAgent.connect(buyer).fulfillCollateral(0, 18, 0, false, "test")
      ).to.be.revertedWith("Only AI relayer can call this");
    });

    it("rejects invalid collateral percent", async () => {
      await expect(
        aiAgent.fulfillCollateral(0, 3, 0, false, "test")
      ).to.be.revertedWith("Invalid collateral %");
    });

    it("hasRiskResult returns false before fulfillment", async () => {
      expect(await aiAgent.hasRiskResult(999)).to.equal(false);
    });

    it("hasRiskResult returns true after fulfillment", async () => {
      await aiAgent.fulfillCollateral(5, 22, 1, true, "Medium risk");
      expect(await aiAgent.hasRiskResult(5)).to.equal(true);
    });
  });

  // ════════════════════════════════════════════════
  // SECTION 9: PSL Franchise Deal (End-to-End)
  // ════════════════════════════════════════════════

  describe("PSL Franchise Deal — Full Flow", () => {

    it("completes a full 3-milestone PSL franchise deal", async () => {
      const total    = ethers.parseEther("5"); // 5 ETH represents 5 Crore
      const m1       = ethers.parseEther("1.5"); // 30%
      const m2       = ethers.parseEther("2");   // 40%
      const m3       = ethers.parseEther("1.5"); // 30%
      const bond     = total * 20n / 100n;

      // PCB is seller, franchise bidder is buyer
      const pcb     = seller;
      const bidder  = buyer;

      // 1. Create PSL franchise deal
      await escrowVault.connect(bidder).createDeal(
        pcb.address,
        3, // PSL_FRANCHISE
        total,
        20,
        ["Bid Acceptance — 30%", "PCB Approval — 40%", "Season Start — 30%"],
        [m1, m2, m3]
      );

      const dealId = 0;

      // 2. Bidder locks full franchise amount
      await escrowVault.connect(bidder).lockBuyerFunds(dealId, { value: total });

      // 3. PCB locks performance bond
      await escrowVault.connect(pcb).lockSellerBond(dealId, { value: bond });

      const deal = await escrowVault.getDeal(dealId);
      expect(deal.state).to.equal(1); // LOCKED

      // 4. Milestone 1: Bid formally accepted
      await escrowVault.connect(bidder).confirmMilestone(dealId);
      let ms = await escrowVault.getMilestones(dealId);
      expect(ms[0].completed).to.equal(true);

      // 5. Milestone 2: PCB approval granted
      await escrowVault.connect(bidder).confirmMilestone(dealId);
      ms = await escrowVault.getMilestones(dealId);
      expect(ms[1].completed).to.equal(true);

      // 6. Milestone 3: Season starts — deal complete
      const pcbBefore = await ethers.provider.getBalance(pcb.address);
      await escrowVault.connect(bidder).confirmMilestone(dealId);
      const pcbAfter  = await ethers.provider.getBalance(pcb.address);

      const finalDeal = await escrowVault.getDeal(dealId);
      expect(finalDeal.state).to.equal(2); // COMPLETED
      expect(pcbAfter).to.be.gt(pcbBefore); // PCB received final payment + bond
    });

    it("Sialkot scenario: bidder defaults, PCB gets penalty automatically", async () => {
      const total = ethers.parseEther("5");
      const bond  = total * 20n / 100n;

      // Create deal, lock both sides
      await escrowVault.connect(buyer).createDeal(
        seller.address, 3, total, 20,
        ["Bid Acceptance"], [total]
      );
      await escrowVault.connect(buyer).lockBuyerFunds(0, { value: total });
      await escrowVault.connect(seller).lockSellerBond(0, { value: bond });

      // Bidder goes silent — grace period expires
      await time.increase(73 * 60 * 60);

      const sellerBefore = await ethers.provider.getBalance(seller.address);

      // Anyone can trigger the penalty
      await escrowVault.connect(arb1).applyPenalty(0);

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter).to.be.gt(sellerBefore);

      const deal = await escrowVault.getDeal(0);
      expect(deal.state).to.equal(3); // DEFAULTED

      // Bidder's score tanks
      const buyerScore = await didRegistry.getScore(buyer.address);
      expect(buyerScore).to.be.lt(100);
    });
  });

});
