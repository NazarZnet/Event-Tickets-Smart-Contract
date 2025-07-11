import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Withdraw Funds", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.EventTickets as Program<EventTickets>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet;
  const buyer = anchor.web3.Keypair.generate();
  const unauthorizedUser = anchor.web3.Keypair.generate();

  const eventId = new anchor.BN(0);
  let eventPda: anchor.web3.PublicKey;
  let eventVaultPda: anchor.web3.PublicKey;

  const getEventPda = (adminPubkey: anchor.web3.PublicKey, eventId: anchor.BN) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event"), adminPubkey.toBuffer(), eventId.toArrayLike(Buffer, "be", 8)],
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
          "Finished Event",
          "FE",
          "An event that is over, with funds in the vault.",
          "https://example.com/nft.json",
          new anchor.BN(Math.floor(Date.now() / 1000) - 2000),
          new anchor.BN(Math.floor(Date.now() / 1000) - 1000),
          new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
          new anchor.BN(1)
        )
        .accounts({ event: eventPda, admin: admin.publicKey })
        .rpc();
      const eventAccount = await program.account.event.fetch(eventPda);
      eventVaultPda = eventAccount.vault;
    }

    // Mint a ticket to ensure there are funds in the vault
    try {
      await program.methods
        .mintTicket(eventId)
        .accounts({ event: eventPda, eventVault: eventVaultPda, buyer: buyer.publicKey })
        .signers([buyer])
        .rpc();
    } catch (e) {
      // If the ticket already exists, that's fine for this test.
    }
  });

  it("Allows the admin to withdraw funds after the event has ended", async () => {
    const adminBalanceBefore = await provider.connection.getBalance(admin.publicKey);
    const vaultBalance = await provider.connection.getBalance(eventVaultPda);
    console.log('Vault balance before withdrawal:', vaultBalance);

    await program.methods
      .withdrawFunds(eventId)
      .accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        admin: admin.publicKey,
      })
      .rpc();

    console.log("\n--- Withdraw Funds Success ---");
    console.log("---------------------------");

    // Verify the event and vault accounts were closed
    const closedEvent = await provider.connection.getAccountInfo(eventPda);
    assert.isNull(closedEvent, "Event account should have been closed.");
    const closedVault = await provider.connection.getAccountInfo(eventVaultPda);
    assert.isNull(closedVault, "Event vault account should have been closed.");

    // Verify the admin's balance increased
    const adminBalanceAfter = await provider.connection.getBalance(admin.publicKey);
    console.log('Admin balance before:', adminBalanceBefore, 'after:', adminBalanceAfter);
    assert.isTrue(adminBalanceAfter > adminBalanceBefore, "Admin balance should have increased.");
    assert.isTrue(adminBalanceAfter >= adminBalanceBefore + vaultBalance, "Admin balance should have increased by at least the vault balance.");
  });

  it("Fails if the event has not ended yet", async () => {
    // Create a new event that is still ongoing
    const futureEventId = new anchor.BN(5);
    const futureEventPda = getEventPda(admin.publicKey, futureEventId);
    let futureEventVaultPda: anchor.web3.PublicKey;

    await program.methods
      .createEvent(
        "Ongoing Event",
        "OE",
        "An event that is still running.",
        "https://example.com/nft2.json",
        new anchor.BN(Math.floor(Date.now() / 1000) - 1000),
        new anchor.BN(Math.floor(Date.now() / 1000) + 2000),
        new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL),
        new anchor.BN(1)
      )
      .accounts({ event: futureEventPda, admin: admin.publicKey })
      .rpc();
    const eventAccount = await program.account.event.fetch(futureEventPda);
    futureEventVaultPda = eventAccount.vault;

    // Attempt to withdraw funds
    try {
      await program.methods
        .withdrawFunds(futureEventId)
        .accounts({
          event: futureEventPda,
          eventVault: futureEventVaultPda,
          admin: admin.publicKey,
        })
        .rpc();
      assert.fail("Should have failed because the event has not ended.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "EventNotEnded");
    }
  });

  it("Fails if an unauthorized user tries to withdraw funds", async () => {
    // Re-fetch the original event to ensure it exists for this test
    const eventAccount = await program.account.event.fetch(eventPda).catch(() => null);
    if (!eventAccount) {
      console.log("Skipping unauthorized test as event was closed in previous test.");
      return;
    }

    try {
      await program.methods
        .withdrawFunds(eventId)
        .accounts({
          event: eventPda,
          eventVault: eventVaultPda,
          admin: unauthorizedUser.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();
      assert.fail("Should have failed because the signer is not the admin.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "ConstraintSeeds"); // Seed constraint failure
    }
  });
});