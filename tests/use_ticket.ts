import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";


describe("Ticket Usage", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;
  const buyer = anchor.web3.Keypair.generate();

  // State for a valid, non-expired ticket
  const eventId = new anchor.BN(1);
  let eventPda: anchor.web3.PublicKey;
  let eventVaultPda: anchor.web3.PublicKey;
  let ticketPda: anchor.web3.PublicKey;
  const ticketId = new anchor.BN(0);

  // --- Helper Functions ---
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
    eventPda = getEventPda(admin.publicKey, eventId);
    await program.methods
      .createEvent(
        "Community Meetup",
        "A meetup for the community.",
        "https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/nft.json",
        new anchor.BN(Math.floor(Date.now() / 1000)), // Starts now
        new anchor.BN(Math.floor(Date.now() / 1000) + 86400), // Ends in 24 hours
        new anchor.BN(0.001 * anchor.web3.LAMPORTS_PER_SOL), // Price
        new anchor.BN(10) // 10 tickets
      )
      .accounts({
        event: eventPda,
        admin: admin.publicKey
      })
      .rpc()
      .catch(err => console.log("Failed to create new event. Error:", err));

    const eventAccount = await program.account.event.fetch(eventPda);
    eventVaultPda = eventAccount.vault;

    await program.methods
      .mintTicket(eventId)
      .accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        buyer: buyer.publicKey
      })
      .signers([buyer])
      .rpc().catch(err => console.log("Failed to mint ticket:", err));

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
      .catch(err => console.log("Failed to use ticket:", err));

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