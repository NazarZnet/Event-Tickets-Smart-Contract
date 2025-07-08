import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Close Expired Ticket", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;
  const buyer = anchor.web3.Keypair.generate();

  const eventId = new anchor.BN(0);
  let eventPda: anchor.web3.PublicKey;
  let ticketPda: anchor.web3.PublicKey;
  const ticketId = new anchor.BN(0);

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
    ticketPda = getTicketPda(eventPda, ticketId);

    // Create an event that has already ended
    await program.methods
      .createEvent(
        "Past Event",
        "An event that is already over.",
        "https://example.com/nft.json",
        new anchor.BN(Math.floor(Date.now() / 1000) - 2000), // Started in the past
        new anchor.BN(Math.floor(Date.now() / 1000) - 1000), // Ended in the past
        new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
        new anchor.BN(1)
      )
      .accounts({ event: eventPda, admin: admin.publicKey })
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Event creation failed in before block:", err));

    // Mint a ticket for the event
    await program.methods
      .mintTicket(eventId)
      .accounts({ event: eventPda, buyer: buyer.publicKey })
      .signers([buyer])
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Minting ticket failed in before block:", err));
  });

  it("Allows the admin to close an expired ticket account", async () => {
    const adminBalanceBefore = await provider.connection.getBalance(admin.publicKey);

    await program.methods
      .closeExpiredTicket(eventId, ticketId)
      .accounts({
        event: eventPda,
        ticket: ticketPda,
        admin: admin.publicKey,
      })
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to close expired ticket:", err));

    console.log("\n--- Close Expired Ticket Success ---");
    console.log("----------------------------------");

    // Verify the ticket account was closed
    try {
      await program.account.ticket.fetch(ticketPda);
      assert.fail("Ticket account should have been closed.");
    } catch (err) {
      assert.include(err.message, "Account does not exist or has no data");
    }

    // Verify the admin's balance increased due to rent refund
    const adminBalanceAfter = await provider.connection.getBalance(admin.publicKey);
    console.log('Admin balance before:', adminBalanceBefore, 'after:', adminBalanceAfter);
    assert.isTrue(adminBalanceAfter > adminBalanceBefore, "Admin balance should have increased.");
  });

  it("Fails if the event has not ended yet", async () => {
    // Create a new event that is still ongoing
    const futureEventId = new anchor.BN(1);
    const futureEventPda = getEventPda(admin.publicKey, futureEventId);
    const futureTicketId = new anchor.BN(0);
    const futureTicketPda = getTicketPda(futureEventPda, futureTicketId);

    await program.methods
      .createEvent(
        "Future Event",
        "An event that is still running.",
        "https://example.com/nft2.json",
        new anchor.BN(Math.floor(Date.now() / 1000) - 1000), // Started in the past
        new anchor.BN(Math.floor(Date.now() / 1000) + 2000), // Ends in the future
        new anchor.BN(0.01 * anchor.web3.LAMPORTS_PER_SOL),
        new anchor.BN(20)
      )
      .accounts({ event: futureEventPda, admin: admin.publicKey })
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to create event:", err));;

    await program.methods
      .mintTicket(futureEventId)
      .accounts({ event: futureEventPda, buyer: buyer.publicKey })
      .signers([buyer])
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to mint ticket:", err));

    // Attempt to close the ticket
    try {
      await program.methods
        .closeExpiredTicket(futureEventId, futureTicketId)
        .accounts({
          event: futureEventPda,
          ticket: futureTicketPda,
          admin: admin.publicKey,
        })
        .rpc();
      assert.fail("Should have failed because the event has not ended.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "EventNotEnded");
    }
  });
});