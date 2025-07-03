# Solana Event Tickets NFT Program

This project is a Solana smart contract (program) for creating and managing event tickets as NFTs. It provides a decentralized solution for event organizers to issue tickets and for attendees to purchase them in a secure and transparent manner.

Each ticket is represented as a unique SPL Token (NFT), ensuring authenticity and ownership on the blockchain.

## Core Features

- **Create Events**: An administrator can create new events with details like name, description, start/end times, ticket price, and total ticket supply.
- **Mint NFT Tickets**: Users can purchase (mint) a ticket for an event. The cost is transferred to a secure vault, and a unique NFT representing the ticket is sent to the buyer's wallet.
- **On-Chain Data**: All event and ticket data is stored in Program-Derived Accounts (PDAs) on the Solana blockchain, ensuring data integrity and availability.
- **Secure Vaults**: Each event automatically gets its own PDA vault to hold the proceeds from ticket sales securely.

## Getting Started

Follow these instructions to set up, build, and test the project on your local machine.

### Prerequisites

- **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
- **Solana Tool Suite**: [Install Solana](https://docs.solana.com/cli/install-solana-cli-tools)
- **Anchor Framework**: [Install Anchor](https://www.anchor-lang.com/docs/installation)
- **Node.js & Yarn**: [Install Node.js](https://nodejs.org/en/download/) and [Yarn](https://classic.yarnpkg.com/en/docs/install)

### 1. Clone the Repository

First, clone the project repository to your local machine:

```bash
git clone https://github.com/NazarZnet/Event-Tickets-Smart-Contract.git
cd Event-Tickets-Smart-Contract
```

### 2. Install Dependencies

Install the required Node.js packages for running the TypeScript tests:

```bash
yarn install
# or
npm install
```

### 3. Build the Program

Compile the Solana program using the Anchor CLI. This will also generate the IDL (Interface Definition Language) required for client-side interaction.

```bash
anchor build
```

### 4. Run the Tests

Run the test suite to verify that the program is working correctly. This command will build the program, start a local Solana test validator, deploy the program, and run the tests located in the `tests/` directory.

```bash
anchor test
```

### 5. Deploy the Program

To deploy the program to a specific Solana cluster (e.g., devnet, mainnet-beta, or a local cluster), first make sure your Solana configuration is set to the desired network:

```bash
# Example: Set config to devnet
solana config set --url devnet
```

Then, run the deploy command:

```bash
anchor deploy
```
