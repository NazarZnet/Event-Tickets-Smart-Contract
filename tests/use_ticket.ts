import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Ticket Usage", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;
  const buyer = anchor.web3.Keypair.generate();
  const unauthorizedUser = anchor.web3.Keypair.generate();

  const eventId = new anchor.BN(2);
  let eventPda: anchor.web3.PublicKey;
  let eventVaultPda: anchor.web3.PublicKey; // Added for minting
  let ticketPda: anchor.web3.PublicKey;
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
          "Tech Conference 2025",
          "TC25",
          "A conference about future technology.",
          "https://example.com/nft.json",
          new anchor.BN(Math.floor(Date.now() / 1000)),
          new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
          new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
          new anchor.BN(10)
        )
        .accounts({ event: eventPda, admin: admin.publicKey })
        .rpc()
        .catch(err => console.log("UseTicket: Failed to create event in before block:", err));
      const eventAccount = await program.account.event.fetch(eventPda);
      eventVaultPda = eventAccount.vault;
    }

    // Dynamically determine the ticket ID and mint
    const eventAccount = await program.account.event.fetch(eventPda);
    ticketId = eventAccount.ticketsSold;

    await program.methods
      .mintTicket(eventId)
      .accounts({
        event: eventPda,
        eventVault: eventVaultPda, // Pass the vault account
        buyer: buyer.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .signers([buyer])
      .rpc()
      .catch(err => console.log("UseTicket: Failed to mint ticket in before block:", err));

    ticketPda = getTicketPda(eventPda, ticketId);
  });

  it("Successfully marks a ticket as used", async () => {
    const ticketBefore = await program.account.ticket.fetch(ticketPda);
    assert.isFalse(ticketBefore.used, "Ticket should not be used yet");

    await program.methods
      .useTicket(eventId, ticketId)
      .accounts({
        event: eventPda,
        ticket: ticketPda,
        admin: admin.publicKey
      })
      .rpc()
      .catch(err => console.log("UseTicket: Failed to use ticket:", err));

    console.log("\n--- Use Ticket Success ---");
    console.log("--------------------------");

    const ticketAfter = await program.account.ticket.fetch(ticketPda);
    console.log('Ticket after use:', ticketAfter);
    assert.isTrue(ticketAfter.used, "Ticket should be marked as used");
  });

  it("Fails to use a ticket that is already used", async () => {
    try {
      await program.methods
        .useTicket(eventId, ticketId)
        .accounts({
          event: eventPda,
          ticket: ticketPda,
          admin: admin.publicKey
        })
        .rpc();
      assert.fail("Should have failed to use an already used ticket.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "TicketAlreadyUsed");
    }
  });

  it("Fails if a non-admin tries to use a ticket", async () => {
    try {
      await program.methods
        .useTicket(eventId, ticketId)
        .accounts({
          event: eventPda,
          ticket: ticketPda,
          admin: buyer.publicKey, // Using buyer as the admin signer
        })
        .signers([buyer]) // Buyer signs instead of admin
        .rpc();
      assert.fail("Should have failed due to unauthorized signer.");
    } catch (err) {
      // The error comes from the address constraint on the admin account
      assert.equal(err.error.errorCode.code, "ConstraintSeeds");
    }
  });
});