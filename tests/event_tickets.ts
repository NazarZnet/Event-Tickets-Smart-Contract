import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("event_tickets", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider();

  const admin = (provider as anchor.AnchorProvider).wallet;

  // Helper to get event_counter PDA
  async function getEventCounterPda(adminPubkey: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event_counter"), adminPubkey.toBuffer()],
      program.programId
    );
  }

  // Helper to get event PDA
  async function getEventPda(adminPubkey: anchor.web3.PublicKey, eventId: number) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        adminPubkey.toBuffer(),
        Buffer.from(Uint8Array.of(...new anchor.BN(eventId).toArray("be", 8))),
      ],
      program.programId
    );
  }

  it("Creates an event successfully", async () => {
    const [eventCounterPda] = await getEventCounterPda(admin.publicKey);
    const [eventPda] = await getEventPda(admin.publicKey, 0);

    const name = "Test Event";
    const description = "This is a test event";
    const startTime = Math.floor(Date.now() / 1000) + 1000;
    const endTime = startTime + 3600;
    const ticketPrice = new anchor.BN(1000);
    const totalTickets = 100;

    await program.methods
      .createEvent(
        name,
        description,
        new anchor.BN(startTime),
        new anchor.BN(endTime),
        ticketPrice,
        totalTickets
      )
      .accounts({
        eventCounter: eventCounterPda,
        event: eventPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([])
      .rpc();

    // Fetch and check event account
    const eventAccount = await program.account.event.fetch(eventPda);
    assert.equal(eventAccount.name, name);
    assert.equal(eventAccount.description, description);
    assert.equal(eventAccount.ticketPrice.toNumber(), ticketPrice.toNumber());
    assert.equal(eventAccount.totalTickets, totalTickets);
    assert.equal(eventAccount.ticketsSold, 0);
  });

  // it("Fails if name is too long", async () => {
  //   const [eventCounterPda] = await getEventCounterPda(admin.publicKey);
  //   const [eventPda] = await getEventPda(admin.publicKey, 1);

  //   const name = "a".repeat(101); // too long
  //   const description = "desc";
  //   const startTime = Math.floor(Date.now() / 1000) + 1000;
  //   const endTime = startTime + 3600;
  //   const ticketPrice = new anchor.BN(1000);
  //   const totalTickets = 100;

  //   try {
  //     await program.methods
  //       .createEvent(
  //         name,
  //         description,
  //         new anchor.BN(startTime),
  //         new anchor.BN(endTime),
  //         ticketPrice,
  //         totalTickets
  //       )
  //       .accounts({
  //         eventCounter: eventCounterPda,
  //         event: eventPda,
  //         admin: admin.publicKey,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //       })
  //       .signers([])
  //       .rpc();
  //     assert.fail("Should have thrown error for long name");
  //   } catch (e) {
  //     assert.include(e.toString(), "NameTooLong");
  //   }
  // });

  // it("Get all events", async () => {
  //   const events = await program.account.event.all();
  //   console.log("All events:", events);
  //   assert.isArray(events);
  //   assert.isTrue(events.length > 0, "No events found");
  // });

  // Helper to get vault PDA
  async function getVaultPda(eventPubkey: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), eventPubkey.toBuffer()],
      program.programId
    );
  }

  // Helper to get ticket mint PDA
  async function getTicketMintPda(eventPubkey: anchor.web3.PublicKey, ticketNumber: number) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ticket_mint"),
        eventPubkey.toBuffer(),
        Buffer.from(Uint8Array.of(...new anchor.BN(ticketNumber).toArray("be", 8))),
      ],
      program.programId
    );
  }

  // Helper to get ticket PDA
  function getTicketPda(
    eventPubkey: anchor.web3.PublicKey,
    ticketNumber: number | anchor.BN
  ): [anchor.web3.PublicKey, number] {
    const ticketBn = typeof ticketNumber === "number" ? new anchor.BN(ticketNumber) : ticketNumber;
    const ticketBuf = ticketBn.toArrayLike(Buffer, "be", 8);

    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ticket"),     // prefix seed
        eventPubkey.toBuffer(),     // PDA event
        ticketBuf,                  // ticket index as 8-byte BE buffer
      ],
      program.programId
    );
  }

  //FIXME: When pass ticket PDA to account see an erro left != right. But ticket PDA in Anchor is generated from seed so it should be generated automatically.
  // When dont pass ticket PDA to account, then it is show error account "<PDA>" does not exists or empty data something like that.
  it("Mints a ticket for the event", async () => {

    const eventId = 0;
    const [eventPda] = await getEventPda(admin.publicKey, eventId);
    const [vaultPda] = await getVaultPda(eventPda);

    const eventAccount = await program.account.event.fetch(eventPda);
    console.log("Event Account:\n", eventAccount);
    const ticketNumber = eventAccount.ticketsSold;

    const [ticketMintPda] = await getTicketMintPda(eventPda, ticketNumber);
    const [ticketPda] = await getTicketPda(eventPda, ticketNumber);
    const buyerTicketAta = anchor.utils.token.associatedAddress({
      mint: ticketMintPda,
      owner: admin.publicKey,
    });

    console.log("eventPda:", eventPda.toBase58());
    console.log("vaultPda:", vaultPda.toBase58());
    console.log("ticketMintPda:", ticketMintPda.toBase58());
    console.log("ticketPda:", ticketPda.toBase58());
    console.log("buyerTicketAta:", buyerTicketAta.toBase58());
    console.log("ticketNumber (ticketsSold):", ticketNumber);

    try {
      await program.methods
        .mintTicket(new anchor.BN(eventId)) // event_id = 0
        .accounts({
          event: eventPda,
          eventVault: eventAccount.vault,
          ticketMint: ticketMintPda,
          buyerTicketAta: buyerTicketAta,
          ticket: ticketPda,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        })
        .signers([])
        .rpc();
      console.log("Mint ticket transaction succeeded");
    } catch (e) {
      console.error("Mint ticket transaction failed:", e);
      if (e.logs) {
        console.error("Transaction logs:", e.logs);
      }
      throw e;
    }

    try {
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      console.log("Ticket Account:", ticketAccount);
      assert.equal(ticketAccount.owner.toBase58(), admin.publicKey.toBase58());
      assert.equal(ticketAccount.mint.toBase58(), ticketMintPda.toBase58());
      assert.equal(ticketAccount.event.toBase58(), eventPda.toBase58());
      assert.isFalse(ticketAccount.used);
    } catch (e) {
      console.error("Fetching ticket account failed:", e);
      throw e;
    }
  });
});