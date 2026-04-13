import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("====================================");
  console.log("Pakka Deal — Contract Deployment");
  console.log("====================================");
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error("Deployer wallet has no funds. Get testnet tokens first.");
  }

  console.log("\n[1/4] Deploying PakkaDealForwarder...");
  const Forwarder = await ethers.getContractFactory("PakkaDealForwarder");
  const forwarder = await Forwarder.deploy();
  await forwarder.waitForDeployment();
  const forwarderAddress = await forwarder.getAddress();
  console.log("    PakkaDealForwarder:", forwarderAddress);

  console.log("\n[2/4] Deploying DIDRegistry...");
  const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
  const didRegistry = await DIDRegistry.deploy();
  await didRegistry.waitForDeployment();
  const didRegistryAddress = await didRegistry.getAddress();
  console.log("    DIDRegistry:", didRegistryAddress);

  console.log("\n[3/4] Deploying EscrowVault...");
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const escrowVault = await EscrowVault.deploy(forwarderAddress, didRegistryAddress);
  await escrowVault.waitForDeployment();
  const escrowVaultAddress = await escrowVault.getAddress();
  console.log("    EscrowVault:", escrowVaultAddress);

  console.log("\n[4/4] Deploying AIAgentInterface...");
  const AIAgent = await ethers.getContractFactory("AIAgentInterface");
  const aiAgent = await AIAgent.deploy();
  await aiAgent.waitForDeployment();
  const aiAgentAddress = await aiAgent.getAddress();
  console.log("    AIAgentInterface:", aiAgentAddress);

  console.log("\n--- Linking contracts ---");

  // Link DIDRegistry to EscrowVault
  const linkTx = await didRegistry.setEscrowVault(escrowVaultAddress);
  await linkTx.wait();
  console.log("    DIDRegistry linked to EscrowVault ✓");

  // Set deployer as AI relayer (team will update later)
  const relayerTx = await aiAgent.setAIRelayer(deployer.address);
  await relayerTx.wait();
  console.log("    AI relayer set to deployer ✓");

  // Save all addresses
  const addresses = {
    network:          "wirefluid",
    chainId:          Number((await ethers.provider.getNetwork()).chainId),
    deployer:         deployer.address,
    forwarder:        forwarderAddress,
    didRegistry:      didRegistryAddress,
    escrowVault:      escrowVaultAddress,
    aiAgentInterface: aiAgentAddress,
    deployedAt:       new Date().toISOString()
  };

  // Save to root of project
  const outputPath = path.join(__dirname, "../deployed.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to deployed.json");

  // Also save ABIs for frontend/backend
  const abiDir = path.join(__dirname, "../abis");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

  const contracts = [
    { name: "EscrowVault", source: "EscrowVault.sol" },
    { name: "DIDRegistry", source: "DIDRegistry.sol" },
    { name: "AIAgentInterface", source: "AIAgentInterface.sol" },
    { name: "PakkaDealForwarder", source: "TrustedForwarder.sol" }
  ];
  for (const { name, source } of contracts) {
    const artifact = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, `../artifacts/contracts/${source}/${name}.json`),
        "utf-8"
      )
    );
    fs.writeFileSync(
      path.join(abiDir, `${name}.json`),
      JSON.stringify(artifact.abi, null, 2)
    );
  }
  console.log("ABIs saved to /abis folder ✓");

  console.log("\n====================================");
  console.log("DEPLOYMENT COMPLETE");
  console.log("====================================");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
