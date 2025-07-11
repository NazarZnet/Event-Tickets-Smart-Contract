import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Ticket Returns", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;
  const buyer = anchor.web3.Keypair.generate();
  const unauthorizedUser = anchor.web3.Keypair.generate(); // For failure test

  const eventId = new anchor.BN(4);
  let eventPda: anchor.web3.PublicKey;
  let eventVaultPda: anchor.web3.PublicKey;
  let ticketPda: anchor.web3.PublicKey;
  let ticketMintPda: anchor.web3.PublicKey;
  let ticketId: anchor.BN;

  const getEventPda = (adminPubkey: anchor.web3.PublicKey, eventId: anchor.BN) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), adminPubkey.toBuffer(), eventId.toArrayLike(Buffer, "be", 8)],
      program.programId
    )[0];
  };

  const getTicketPda = (eventPubkey: anchor.web3.PublicKey, ticketId: anchor.BN) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), eventPubkey.toBuffer(), ticketId.toArrayLike(Buffer, "be", 8)],
      program.programId
    )[0];
  };

  before(async () => {
    await provider.connection.requestAirdrop(buyer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL).then(sig => provider.connection.confirmTransaction(sig));
    await provider.connection.requestAirdrop(unauthorizedUser.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL).then(sig => provider.connection.confirmTransaction(sig));

    eventPda = getEventPda(admin.publicKey, eventId);

    // Fetch or create the event
    try {
      const eventAccount = await program.account.event.fetch(eventPda);
      eventVaultPda = eventAccount.vault;
    } catch (error) {
      await program.methods
        .createEvent(
          "Refundable Concert",
          "An event for which tickets can be returned.",
          "https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/nft.json",
          new anchor.BN(Math.floor(Date.now() / 1000)),
          new anchor.BN(Math.floor(Date.now() / 1000) + 86400), // Ends in 24 hours
          new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL), // 1 SOL price
          new anchor.BN(5)
        )
        .accounts({
          event: eventPda,
          admin: admin.publicKey
        })
        .rpc()
        .catch(err => console.log("ReturnTicket: Failed to create event in before block:", err));
      const eventAccount = await program.account.event.fetch(eventPda);
      eventVaultPda = eventAccount.vault;
    }

    // Dynamically determine the ticket ID and mint
    const eventAccount = await program.account.event.fetch(eventPda);
    ticketId = eventAccount.ticketsSold; // Use the current count as the new ID

    await program.methods
      .mintTicket(eventId)
      .accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        buyer: buyer.publicKey,
      })
      .signers([buyer])
      .rpc()
      .catch(err => console.log("ReturnTicket: Failed to mint ticket in before block:", err));

    ticketPda = getTicketPda(eventPda, ticketId);
    const ticketAccount = await program.account.ticket.fetch(ticketPda);
    ticketMintPda = ticketAccount.mint;
  });

  it("Allows a buyer to return their ticket for a refund", async () => {
    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);
    const eventAccountBefore = await program.account.event.fetch(eventPda);
    const ticketsReturnedCount = eventAccountBefore.ticketsReturned;

    await program.methods
      .returnTicket(eventId, ticketId)
      .accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        ticket: ticketPda,
        ticketMint: ticketMintPda,
        signer: buyer.publicKey,
      })
      .signers([buyer])
      .rpc()
      .catch(err => console.log("ReturnTicket: Failed to return ticket:", err));

    console.log("\n--- Return Ticket Success ---");
    console.log("---------------------------");

    // Verify buyer's balance increased (roughly by ticket price, less fees)
    const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
    console.log('Buyer balance before:', buyerBalanceBefore, 'after:', buyerBalanceAfter);
    assert.isTrue(buyerBalanceAfter > buyerBalanceBefore, "Buyer balance should have increased after refund.");

    // Verify the ticket account was closed
    try {
      await program.account.ticket.fetch(ticketPda);
      assert.fail("Ticket account should have been closed.");
    } catch (err) {
      assert.include(err.message, "Account does not exist or has no data");
    }

    // Verify the event's tickets_returned count was incremented
    const eventAccountAfter = await program.account.event.fetch(eventPda);
    assert.isTrue(eventAccountAfter.ticketsReturned > ticketsReturnedCount, "Tickets sold should decrement");
  });
});