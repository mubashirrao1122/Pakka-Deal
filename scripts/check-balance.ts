import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Wallet:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "WF tokens");
  if (balance === 0n) {
    console.log("ERROR: No tokens. Get from WireFluid faucet first.");
  } else {
    console.log("Ready to deploy!");
  }
}
main().catch(console.error);
