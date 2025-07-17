import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import { EventTickets } from './../target/types/event_tickets';

// Helper function to sleep for a given number of milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

  it("Allows the admin to close an expired ticket account", async () => {
    await provider.connection.requestAirdrop(buyer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL).then(sig => provider.connection.confirmTransaction(sig));

    eventPda = getEventPda(admin.publicKey, eventId);
    ticketPda = getTicketPda(eventPda, ticketId);

    const eventEndTime = Math.floor(Date.now() / 1000) + 3; // Event ends in 3 seconds
    await program.methods
      .createEvent(
        "Short-Lived Event",
        "SLE",
        "This event will end soon.",
        "https://example.com/nft.json",
        new anchor.BN(Math.floor(Date.now() / 1000)),
        new anchor.BN(eventEndTime),
        new anchor.BN(0.01 * anchor.web3.LAMPORTS_PER_SOL),
        new anchor.BN(10)
      )
      .accounts({ event: eventPda, admin: admin.publicKey })
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to create event: ", err));

    await program.methods
      .mintTicket(eventId)
      .accounts({ event: eventPda, buyer: buyer.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID })
      .signers([buyer])
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to mint ticket: ", err));

    // Wait for the event to end
    console.log("\nWaiting for the event to end...");
    await sleep(5000); // Wait 5 seconds

    const ticketAccount = await program.account.ticket.fetch(ticketPda);
    console.log("Ticket Account:", ticketAccount);
    console.log("----------------------------------");


    const adminBalanceBefore = await provider.connection.getBalance(admin.publicKey);

    await program.methods
      .closeExpiredTicket(eventId, ticketId)
      .accounts({
        event: eventPda,
        ticket: ticketPda,
        admin: admin.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to close ticket", err));

    console.log("\n--- Close Expired Ticket Success ---");
    console.log("----------------------------------");

    const closedTicket = await provider.connection.getAccountInfo(ticketPda);
    assert.isNull(closedTicket, "Ticket account should have been closed.");

    const adminBalanceAfter = await provider.connection.getBalance(admin.publicKey);
    console.log('Admin balance before:', adminBalanceBefore, 'after:', adminBalanceAfter);
    assert.isTrue(adminBalanceAfter > adminBalanceBefore, "Admin balance should have increased.");
  });

  it("Fails if the event has not ended yet", async () => {
    const futureEventId = new anchor.BN(1);
    const futureEventPda = getEventPda(admin.publicKey, futureEventId);
    const futureTicketId = new anchor.BN(0);
    const futureTicketPda = getTicketPda(futureEventPda, futureTicketId);

    await program.methods
      .createEvent(
        "Future Event",
        "FE",
        "An event that is still running.",
        "https://example.com/nft2.json",
        new anchor.BN(Math.floor(Date.now() / 1000) - 1000),
        new anchor.BN(Math.floor(Date.now() / 1000) + 5000), // Ends in 5 seconds
        new anchor.BN(0.01 * anchor.web3.LAMPORTS_PER_SOL),
        new anchor.BN(10)
      )
      .accounts({ event: futureEventPda, admin: admin.publicKey })
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to create future event: ", err));

    await program.methods
      .mintTicket(futureEventId)
      .accounts({ event: futureEventPda, buyer: buyer.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID })
      .signers([buyer])
      .rpc()
      .catch(err => console.log("CloseExpiredTicket: Failed to mint future ticket: ", err));

    try {
      await program.methods
        .closeExpiredTicket(futureEventId, futureTicketId)
        .accounts({
          event: futureEventPda,
          ticket: futureTicketPda,
          admin: admin.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have failed because the event has not ended.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "EventNotEnded");
    }
  });
});
