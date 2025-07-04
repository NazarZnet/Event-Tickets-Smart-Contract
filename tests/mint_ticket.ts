import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Ticket Minting", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;
  const buyer = anchor.web3.Keypair.generate();

  let eventPda: anchor.web3.PublicKey;
  let eventVaultPda: anchor.web3.PublicKey;
  const eventId = new anchor.BN(0);

  const getEventPda = (adminPubkey: anchor.web3.PublicKey, eventId: anchor.BN) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), adminPubkey.toBuffer(), eventId.toArrayLike(Buffer, "be", 8)],
      program.programId
    )[0];
  };

  const getTicketPda = (eventPubkey: anchor.web3.PublicKey, ticketNumber: anchor.BN) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), eventPubkey.toBuffer(), ticketNumber.toArrayLike(Buffer, "be", 8)],
      program.programId
    )[0];
  };



  before(async () => {
    const signature = await provider.connection.requestAirdrop(buyer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(signature, "confirmed");

    eventPda = getEventPda(admin.publicKey, eventId);
    try {
      const eventAccount = await program.account.event.fetch(eventPda);
      eventVaultPda = eventAccount.vault;
    } catch (error) {
      await program.methods
        .createEvent(
          "Live Concert",
          "A live concert featuring top artists.",
          "https://raw.githubusercontent.com/solana-developers/program-examples/new-examples/tokens/tokens/.assets/nft.json",
          new anchor.BN(Math.floor(Date.now() / 1000)),
          new anchor.BN(Math.floor(Date.now() / 1000) + 7200),
          new anchor.BN(0.01 * anchor.web3.LAMPORTS_PER_SOL),
          new anchor.BN(10)
        )
        .accounts({
          event: eventPda,
          admin: admin.publicKey,
        })
        .rpc();
      const eventAccount = await program.account.event.fetch(eventPda);
      eventVaultPda = eventAccount.vault;
    }
  });

  it("Mints a ticket NFT successfully", async () => {
    const eventAccountBefore = await program.account.event.fetch(eventPda);
    const ticketNumber = eventAccountBefore.ticketsSold;

    await program.methods
      .mintTicket(eventId)
      .accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        buyer: buyer.publicKey
      })
      .signers([buyer])
      .rpc();

    const ticketPda = getTicketPda(eventPda, ticketNumber);
    const ticketAccount = await program.account.ticket.fetch(ticketPda);

    console.log("\n--- Mint Ticket Success ---");
    console.log('Ticket:', ticketAccount);
    console.log("---------------------------");

    assert.equal(ticketAccount.owner.toBase58(), buyer.publicKey.toBase58());

    const eventAccountAfter = await program.account.event.fetch(eventPda);
    assert.isTrue(eventAccountAfter.ticketsSold.eq(ticketNumber.add(new anchor.BN(1))));
  });

  // it("Fails to mint a ticket when the event is sold out", async () => {
  //   let eventAccount = await program.account.event.fetch(eventPda);
  //   console.log("Tickets sold before minting:", eventAccount);
  //   console.log('Event:', eventPda, 'Vault:', eventVaultPda);
  //   while (eventAccount.ticketsSold.lt(eventAccount.totalTickets)) {
  //     await program.methods.mintTicket(eventId).accounts({
  //       event: eventPda,
  //       eventVault: eventVaultPda,
  //       buyer: buyer.publicKey,
  //     })
  //       .signers([buyer])
  //       .rpc();

  //     eventAccount = await program.account.event.fetch(eventPda);
  //   }
  //   console.log("All tickets sold out.");

  //   try {
  //     await program.methods.mintTicket(eventId).accounts({
  //       event: eventPda,
  //       eventVault: eventVaultPda,
  //       buyer: buyer.publicKey,
  //     })
  //       .signers([buyer])
  //       .rpc();

  //     assert.fail("The transaction should have failed because the event is sold out.");
  //   } catch (err) {
  //     assert.equal(err.error.errorCode.code, "EventSoldOut");
  //   }
  // });
});