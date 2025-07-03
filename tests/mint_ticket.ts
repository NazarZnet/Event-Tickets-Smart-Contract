import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
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

  const getTicketMintPda = (eventPubkey: anchor.web3.PublicKey, ticketNumber: anchor.BN) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ticket_mint"), eventPubkey.toBuffer(), ticketNumber.toArrayLike(Buffer, "be", 8)],
      program.programId
    )[0];
  };

  before(async () => {
    const signature = await provider.connection.requestAirdrop(buyer.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(signature, "confirmed");

    eventPda = getEventPda(admin.publicKey, eventId);
    const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), eventPda.toBuffer()],
      program.programId
    );
    eventVaultPda = vaultPda;

    const [eventCounterPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event_counter"), admin.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.account.event.fetch(eventPda);
    } catch (error) {
      await program.methods
        .createEvent(
          "Live Concert",
          "A live concert featuring top artists.",
          new anchor.BN(Math.floor(Date.now() / 1000)),
          new anchor.BN(Math.floor(Date.now() / 1000) + 7200),
          new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL),
          new anchor.BN(2) // u64
        )
        .accounts({
          eventCounter: eventCounterPda,
          event: eventPda,
          vault: eventVaultPda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("Mints a ticket NFT successfully", async () => {
    const eventAccountBefore = await program.account.event.fetch(eventPda);
    const ticketNumber = eventAccountBefore.ticketsSold; // This is a BN now

    const ticketMintPda = getTicketMintPda(eventPda, ticketNumber);
    const ticketPda = getTicketPda(eventPda, ticketNumber);

    const buyerTicketAta = await getAssociatedTokenAddress(ticketMintPda, buyer.publicKey);

    await program.methods
      .mintTicket(eventId)
      .accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        buyer: buyer.publicKey,
        ticket: ticketPda,
        ticketMint: ticketMintPda,
        buyerTicketAta: buyerTicketAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    const ticketAccount = await program.account.ticket.fetch(ticketPda);
    assert.equal(ticketAccount.owner.toBase58(), buyer.publicKey.toBase58());

    const eventAccountAfter = await program.account.event.fetch(eventPda);
    assert.isTrue(eventAccountAfter.ticketsSold.eq(ticketNumber.add(new anchor.BN(1))));

    const buyerAtaBalance = await provider.connection.getTokenAccountBalance(buyerTicketAta);
    assert.equal(buyerAtaBalance.value.uiAmount, 1);
  });

  it("Fails to mint a ticket when the event is sold out", async () => {
    let eventAccount = await program.account.event.fetch(eventPda);
    while (eventAccount.ticketsSold.lt(eventAccount.totalTickets)) {
      const ticketNumber = eventAccount.ticketsSold;
      const ticketMintPda = getTicketMintPda(eventPda, ticketNumber);
      const ticketPda = getTicketPda(eventPda, ticketNumber);
      const buyerTicketAta = await getAssociatedTokenAddress(ticketMintPda, buyer.publicKey);

      await program.methods.mintTicket(eventId).accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        buyer: buyer.publicKey,
        ticket: ticketPda,
        ticketMint: ticketMintPda,
        buyerTicketAta: buyerTicketAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      }).signers([buyer]).rpc();

      eventAccount = await program.account.event.fetch(eventPda);
    }

    try {
      const ticketNumber = eventAccount.ticketsSold;
      const ticketMintPda = getTicketMintPda(eventPda, ticketNumber);
      const ticketPda = getTicketPda(eventPda, ticketNumber);
      const buyerTicketAta = await getAssociatedTokenAddress(ticketMintPda, buyer.publicKey);

      await program.methods.mintTicket(eventId).accounts({
        event: eventPda,
        eventVault: eventVaultPda,
        buyer: buyer.publicKey,
        ticket: ticketPda,
        ticketMint: ticketMintPda,
        buyerTicketAta: buyerTicketAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      }).signers([buyer]).rpc();

      assert.fail("The transaction should have failed because the event is sold out.");
    } catch (err) {
      assert.equal(err.error.errorCode.code, "EventSoldOut");
    }
  });
});