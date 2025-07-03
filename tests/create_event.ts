import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Event Creation", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;

  // Helper Functions
  const getEventCounterPda = (adminPubkey: anchor.web3.PublicKey) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event_counter"), adminPubkey.toBuffer()],
      program.programId
    );
  };

  const getEventPda = (adminPubkey: anchor.web3.PublicKey, eventId: anchor.BN) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("event"),
        adminPubkey.toBuffer(),
        eventId.toArrayLike(Buffer, "be", 8),
      ],
      program.programId
    );
  };

  // Test Cases

  it("Creates a new event successfully", async () => {
    const eventId = new anchor.BN(0);
    const [eventCounterPda] = getEventCounterPda(admin.publicKey);
    const [eventPda] = getEventPda(admin.publicKey, eventId);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), eventPda.toBuffer()],
      program.programId
    );

    const name = "Solana Summit 2025";
    const description = "The biggest conference for Solana developers and enthusiasts.";
    const startTime = new anchor.BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const endTime = new anchor.BN(startTime.toNumber() + 86400); // 24 hours duration
    const ticketPrice = new anchor.BN(0.001 * anchor.web3.LAMPORTS_PER_SOL);
    const totalTickets = new anchor.BN(10);

    await program.methods
      .createEvent(
        name,
        description,
        startTime,
        endTime,
        ticketPrice,
        totalTickets
      )
      .accounts({
        eventCounter: eventCounterPda,
        event: eventPda,
        vault: vaultPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const eventAccount = await program.account.event.fetch(eventPda);
    assert.equal(eventAccount.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(eventAccount.name, name);
    assert.equal(eventAccount.description, description);
    assert.isTrue(eventAccount.ticketPrice.eq(ticketPrice));
    assert.isTrue(eventAccount.totalTickets.eq(totalTickets));
    assert.isTrue(eventAccount.ticketsSold.eq(new anchor.BN(0)));
    assert.isTrue(eventAccount.startTime.eq(startTime));
    assert.isTrue(eventAccount.endTime.eq(endTime));

    const eventCounterAccount = await program.account.eventCounter.fetch(eventCounterPda);
    assert.isTrue(eventCounterAccount.nextEventId.eq(new anchor.BN(1)));
  });

  it("Fails to create an event with a name that is too long", async () => {
    const eventId = new anchor.BN(1);
    const [eventCounterPda] = getEventCounterPda(admin.publicKey);
    const [eventPda] = getEventPda(admin.publicKey, eventId);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), eventPda.toBuffer()],
      program.programId
    );

    const longName = "a".repeat(101);

    try {
      await program.methods
        .createEvent(
          longName,
          "A valid description",
          new anchor.BN(Math.floor(Date.now() / 1000) + 1000),
          new anchor.BN(Math.floor(Date.now() / 1000) + 2000),
          new anchor.BN(100000000),
          new anchor.BN(100)
        )
        .accounts({
          eventCounter: eventCounterPda,
          event: eventPda,
          vault: vaultPda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("The transaction should have failed due to the long name.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "NameTooLong");
    }
  });

  it("Fails to create an event with an invalid time range", async () => {
    const eventId = new anchor.BN(1);
    const [eventCounterPda] = getEventCounterPda(admin.publicKey);
    const [eventPda] = getEventPda(admin.publicKey, eventId);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), eventPda.toBuffer()],
      program.programId
    );

    const now = Math.floor(Date.now() / 1000);
    const startTime = new anchor.BN(now + 2000);
    const endTime = new anchor.BN(now + 1000);

    try {
      await program.methods
        .createEvent(
          "Valid Name",
          "A valid description",
          startTime,
          endTime,
          new anchor.BN(100000000),
          new anchor.BN(100)
        )
        .accounts({
          eventCounter: eventCounterPda,
          event: eventPda,
          vault: vaultPda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("The transaction should have failed due to invalid time range.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "InvalidEventTime");
    }
  });
});