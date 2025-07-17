import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
    createAssociatedTokenAccountInstruction,
    createTransferCheckedWithTransferHookInstruction,
    getAssociatedTokenAddress,
    TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import { assert } from "chai";
import { EventTickets } from "../target/types/event_tickets";

describe("Ticket Minting and Transfer Hook", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.EventTickets as Program<EventTickets>;
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const admin = provider.wallet;

    // Use dedicated keypairs for the test to ensure isolation
    const buyer = anchor.web3.Keypair.generate();
    const recipient = anchor.web3.Keypair.generate();

    // Use a unique event ID for this test run to avoid state conflicts
    const eventId = new anchor.BN(1);
    let eventPda: anchor.web3.PublicKey;
    let eventVaultPda: anchor.web3.PublicKey;
    let ticketMintPda: anchor.web3.PublicKey;

    // Helper functions to derive PDAs, consistent with your program's logic
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

    const getExtraAccountMetaListPda = (mint: anchor.web3.PublicKey) => {
        return anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("extra-account-metas"), mint.toBuffer()],
            program.programId
        )[0];
    };

    const getTiketOwnershipPda = (mintPda: anchor.web3.PublicKey) => {
        return anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("ticket_ownership"), mintPda.toBuffer()],
            program.programId
        )[0];
    };

    before(async () => {
        // Fund the buyer and recipient accounts
        await Promise.all([
            provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(buyer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
                "confirmed"
            ),
            provider.connection.confirmTransaction(
                await provider.connection.requestAirdrop(recipient.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
                "confirmed"
            ),
        ]);

        // Create a new event for this test run
        eventPda = getEventPda(admin.publicKey, eventId);
        try {
            const eventAccount = await program.account.event.fetch(eventPda);
            eventVaultPda = eventAccount.vault;
        } catch (error) {
            await program.methods
                .createEvent(
                    "Live Concert",
                    "LC",
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
                .rpc()
                .catch(err => console.log("MintTicket: Failed to create event in before block:", err));
            const eventAccount = await program.account.event.fetch(eventPda);
            eventVaultPda = eventAccount.vault;
        }

    });

    it("Mints a ticket, initializes the hook, and executes it on transfer", async () => {
        const eventAccountBefore = await program.account.event.fetch(eventPda);
        const ticketNumber = eventAccountBefore.ticketsSold;

        const ticketPda = getTicketPda(eventPda, ticketNumber);
        ticketMintPda = getTicketMintPda(eventPda, ticketNumber);


        await program.methods
            .mintTicket(eventId)
            .accounts({
                event: eventPda,
                eventVault: eventVaultPda,
                ticket: ticketPda,
                ticketMint: ticketMintPda,
                buyer: buyer.publicKey,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([buyer])
            .rpc()
            .catch(err => console.log("MintTicket: Failed to mint ticket:", err));

        const ticketAccount = await program.account.ticket.fetch(ticketPda);
        console.log(`Ticket:`, ticketAccount);
        console.log("Ticket minted successfully. Mint PDA:", ticketMintPda.toBase58());

        const ticketOwnershipPda = getTiketOwnershipPda(ticketMintPda);
        const ticketOwnershipAccount = await program.account.ticketOwnership.fetch(ticketOwnershipPda);
        console.log("Current ticket owner:", ticketOwnershipAccount.owner.toBase58());

        const buyerAta = await getAssociatedTokenAddress(ticketMintPda, buyer.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const recipientAta = await getAssociatedTokenAddress(ticketMintPda, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);

        // Create the recipient's associated token account
        const createRecipientAtaTx = new anchor.web3.Transaction().add(
            createAssociatedTokenAccountInstruction(
                provider.wallet.publicKey, // Payer
                recipientAta,
                recipient.publicKey,
                ticketMintPda,
                TOKEN_2022_PROGRAM_ID
            )
        );
        await provider.sendAndConfirm(createRecipientAtaTx, [], { skipPreflight: true }).catch(err => console.log("MintTicket: Failed to create recipient ATA:", err));
        console.log("Recipient ATA created:", recipientAta.toBase58());

        console.log("Executing first transfer...");
        const transferInstruction = await createTransferCheckedWithTransferHookInstruction(
            provider.connection,
            buyerAta,
            ticketMintPda,
            recipientAta,
            buyer.publicKey,
            BigInt(1),
            0,
            [],
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );

        const transaction = new anchor.web3.Transaction().add(transferInstruction);
        await provider.sendAndConfirm(transaction, [buyer], { skipPreflight: true, }).catch(err => console.log("MintTicket: Failed to execute first transfer:", err));
        console.log("First transfer successful!");


        const ticketOwnershipAccount2 = await program.account.ticketOwnership.fetch(ticketOwnershipPda);
        console.log("Ticket owner after first transfer:", ticketOwnershipAccount2.owner.toBase58());
        assert.notEqual(ticketOwnershipAccount2.owner.toBase58(), ticketOwnershipAccount.owner.toBase58(), "Ticket owner should change after first transfer");

        console.log("Executing second transfer (transfer back)...");
        const transferBackInstruction = await createTransferCheckedWithTransferHookInstruction(
            provider.connection,
            recipientAta,
            ticketMintPda,
            buyerAta,
            recipient.publicKey,
            BigInt(1),
            0,
            [],
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );
        const tx2 = new anchor.web3.Transaction().add(transferBackInstruction);
        await provider.sendAndConfirm(tx2, [recipient], { skipPreflight: true }).catch(err => console.log("MintTicket: Failed to execute second transfer:", err));
        console.log("Second transfer successful!");

        const ticketOwnershipAccount3 = await program.account.ticketOwnership.fetch(ticketOwnershipPda);
        console.log("Ticket owner after second transfer:", ticketOwnershipAccount3.owner.toBase58());
        assert.equal(ticketOwnershipAccount3.owner.toBase58(), ticketOwnershipAccount.owner.toBase58(), "Ticket owner should be the original buyer after second transfer");

    });
});
