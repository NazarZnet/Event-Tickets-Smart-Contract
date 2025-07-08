import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Event Creation", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;

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

  it("Creates a new event successfully", async () => {
    const name = "Solana Summit 2025";
    const description = "The biggest conference for Solana developers and enthusiasts.";
    const metadataUri = "https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/nft.json";
    const startTime = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);
    const endTime = new anchor.BN(startTime.toNumber() + 86400);
    const ticketPrice = new anchor.BN(0.01 * anchor.web3.LAMPORTS_PER_SOL);
    const totalTickets = new anchor.BN(10);

    const [eventPda, _] = getEventPda(admin.publicKey, new anchor.BN(2));

    await program.methods
      .createEvent(
        name,
        description,
        metadataUri,
        startTime,
        endTime,
        ticketPrice,
        totalTickets
      )
      .accounts({
        event: eventPda,
        admin: admin.publicKey,
      })
      .rpc()
      .catch(err => console.log("CreateEvent: Failed to create event:", err));



    const eventAccount = await program.account.event.fetch(eventPda);

    console.log("\n--- Create Event Success ---");
    console.log('Event:', eventAccount);
    console.log("--------------------------");

    assert.equal(eventAccount.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(eventAccount.name, name);
    assert.isTrue(eventAccount.totalTickets.eq(totalTickets));
  });

  it("Fails to create an event with a name that is too long", async () => {
    try {
      const [eventPda, _] = getEventPda(admin.publicKey, new anchor.BN(3));

      await program.methods
        .createEvent(
          "a".repeat(101), // Too long
          "A valid description",
          "https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/nft.json",
          new anchor.BN(Math.floor(Date.now() / 1000) + 1000),
          new anchor.BN(Math.floor(Date.now() / 1000) + 2000),
          new anchor.BN(100000000),
          new anchor.BN(100)
        )
        .accounts({
          event: eventPda,
          admin: admin.publicKey
        })
        .rpc();
      assert.fail("The transaction should have failed due to the long name.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "NameTooLong");
      console.log("Expected error caught: NameTooLong");
    }
  });

  it("Fetches all created events", async () => {
    const eventAccounts = await program.account.event.all();
    console.log(`\n--- Found ${eventAccounts.length} Event(s) ---
`);
    assert.isArray(eventAccounts);
    assert.isTrue(eventAccounts.length > 0, "No events found");

    for (const event of eventAccounts) {
      console.log('Event: ', event.account);
      console.log("-------");
    }
    console.log("--------------------------");
  });
});