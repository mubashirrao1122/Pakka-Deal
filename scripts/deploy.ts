import { ethers } from "hardhat";

async function main() {
  console.log("Starting deployment to WireFluid Testnet...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}\n`);

  // 1. Deploy MinimalForwarder
  console.log("Deploying MinimalForwarder...");
  // Assumes MinimalForwarder is part of project artifacts.
  const MinimalForwarder = await ethers.getContractFactory("MinimalForwarder");
  const forwarder = await MinimalForwarder.deploy();
  await forwarder.waitForDeployment();
  const forwarderAddress = await forwarder.getAddress();
  const forwarderTxHash = forwarder.deploymentTransaction()?.hash;
  console.log(`MinimalForwarder Deployed!`);
  console.log(`Address: ${forwarderAddress}`);
  console.log(`Tx Hash: ${forwarderTxHash}\n`);

  // 2. Deploy DIDRegistry
  console.log("Deploying DIDRegistry...");
  const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
  const didRegistry = await DIDRegistry.deploy();
  await didRegistry.waitForDeployment();
  const didRegistryAddress = await didRegistry.getAddress();
  const didRegistryTxHash = didRegistry.deploymentTransaction()?.hash;
  console.log(`DIDRegistry Deployed!`);
  console.log(`Address: ${didRegistryAddress}`);
  console.log(`Tx Hash: ${didRegistryTxHash}\n`);

  // 3. Deploy ArbitratorRegistry
  console.log("Deploying ArbitratorRegistry...");
  const ArbitratorRegistry = await ethers.getContractFactory("ArbitratorRegistry");
  const arbitratorRegistry = await ArbitratorRegistry.deploy();
  await arbitratorRegistry.waitForDeployment();
  const arbitratorRegistryAddress = await arbitratorRegistry.getAddress();
  const arbitratorRegistryTxHash = arbitratorRegistry.deploymentTransaction()?.hash;
  console.log(`ArbitratorRegistry Deployed!`);
  console.log(`Address: ${arbitratorRegistryAddress}`);
  console.log(`Tx Hash: ${arbitratorRegistryTxHash}\n`);

  // 4. Deploy AIAgentInterface
  console.log("Deploying AIAgentInterface...");
  const AIAgentInterface = await ethers.getContractFactory("AIAgentInterface");
  const aiAgentInterface = await AIAgentInterface.deploy();
  await aiAgentInterface.waitForDeployment();
  const aiAgentInterfaceAddress = await aiAgentInterface.getAddress();
  const aiAgentInterfaceTxHash = aiAgentInterface.deploymentTransaction()?.hash;
  console.log(`AIAgentInterface Deployed!`);
  console.log(`Address: ${aiAgentInterfaceAddress}`);
  console.log(`Tx Hash: ${aiAgentInterfaceTxHash}\n`);

  // 5. Deploy EscrowVault
  console.log("Deploying EscrowVault...");
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const escrowVault = await EscrowVault.deploy(
    forwarderAddress,
    didRegistryAddress,
    arbitratorRegistryAddress,
    aiAgentInterfaceAddress
  );
  await escrowVault.waitForDeployment();
  const escrowVaultAddress = await escrowVault.getAddress();
  const escrowVaultTxHash = escrowVault.deploymentTransaction()?.hash;
  console.log(`EscrowVault Deployed!`);
  console.log(`Address: ${escrowVaultAddress}`);
  console.log(`Tx Hash: ${escrowVaultTxHash}\n`);

  console.log("All Pakka Deal contracts have been deployed successfully to the WireFluid Testnet!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
