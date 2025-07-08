use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{
        create_master_edition_v3, create_metadata_accounts_v3, CreateMasterEditionV3,
        CreateMetadataAccountsV3, Metadata,
    },
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};
use mpl_token_metadata::types::DataV2;

use crate::{
    constants::{DISCRIMINATOR_LENGHT, EVENT_SEED, TICKET_MINT_SEED, TICKET_SEED, VAULT_SEED},
    errors::EventError,
    state::{Event, EventVault, Ticket},
};
/// Contextual accounts required to mint a ticket NFT for an event.
#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct MintTicket<'info> {
    /// The event account for which the ticket is being minted.
    /// This account is validated using seeds to ensure it matches the `event_id`.
    #[account(
        mut,
        seeds = [EVENT_SEED, event.admin.as_ref(), event_id.to_be_bytes().as_ref()],
        bump = event.bump,
    )]
    pub event: Account<'info, Event>,

    /// The event's vault account, where the ticket payment will be sent.
    /// The address is checked to ensure it matches the one stored in the event account.
    #[account(
        mut,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump
    )]
    pub event_vault: Account<'info, EventVault>,

    /// The buyer of the ticket. Must be a signer.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// The PDA account that will store the ticket's metadata.
    #[account(
        init,
        payer = buyer,
        space = Ticket::INIT_SPACE + DISCRIMINATOR_LENGHT,
        seeds = [TICKET_SEED, event.key().as_ref(), event.tickets_sold.to_be_bytes().as_ref()],
        bump,
    )]
    pub ticket: Account<'info, Ticket>,

    /// The SPL token mint for the ticket NFT. Each ticket has a unique mint.    
    #[account(
        init,
        payer = buyer,
        mint::decimals = 0,
        mint::authority = ticket,  // The ticket PDA is the mint authority
        mint::freeze_authority = ticket, // and the freeze authority
        seeds = [TICKET_MINT_SEED, event.key().as_ref(), event.tickets_sold.to_be_bytes().as_ref()],
        bump
    )]
    pub ticket_mint: Account<'info, Mint>,

    /// The buyer's Associated Token Account (ATA) to receive the ticket NFT.
    /// It will be created if it does not exist.
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = ticket_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_ticket_ata: Account<'info, TokenAccount>,

    /// CHECK: Metaplex Metadata account
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), ticket_mint.key().as_ref()],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub metadata_account: UncheckedAccount<'info>,

    /// CHECK: Metaplex Master Edition account
    #[account(
        mut,
        seeds = [b"metadata", token_metadata_program.key().as_ref(), ticket_mint.key().as_ref(), b"edition"],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub master_edition_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Handles the logic for minting a new ticket NFT.
///
/// # Arguments
///
/// * `ctx` - The context containing all necessary accounts.
/// * `_event_id` - The ID of the event, used for PDA validation in the account constraints.
///
/// # Returns
///
/// An empty `Result` indicating success or failure.
pub fn mint_ticket_handler(ctx: Context<MintTicket>, _event_id: u64) -> Result<()> {
    let event = &mut ctx.accounts.event;

    require!(
        event.tickets_sold < event.total_tickets,
        EventError::EventSoldOut
    );
    require!(
        **ctx.accounts.buyer.to_account_info().lamports.borrow() >= event.ticket_price,
        EventError::InsufficientFunds
    );

    // Payment Transfer
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.event_vault.to_account_info(),
            },
        ),
        event.ticket_price,
    )?;

    // NFT Minting
    let event_pubkey = event.key();
    let ticket_signer_seeds = &[
        TICKET_SEED,
        event_pubkey.as_ref(),
        &event.tickets_sold.to_be_bytes(),
        &[ctx.bumps.ticket],
    ];
    let signer = &[&ticket_signer_seeds[..]];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.ticket_mint.to_account_info(),
                to: ctx.accounts.buyer_ticket_ata.to_account_info(),
                authority: ctx.accounts.ticket.to_account_info(),
            },
            signer,
        ),
        1,
    )?;

    let nft_name = format!("{} #{}", event.name, event.tickets_sold);
    let nft_symbol = "TKT".to_string();

    create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata_account.to_account_info(),
                mint: ctx.accounts.ticket_mint.to_account_info(),
                mint_authority: ctx.accounts.ticket.to_account_info(),
                update_authority: ctx.accounts.ticket.to_account_info(),
                payer: ctx.accounts.buyer.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer,
        ),
        DataV2 {
            name: nft_name,
            symbol: nft_symbol,
            uri: event.metadata_uri.clone(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        false, // Is mutable
        true,  // Update authority is signer
        None,  // Collection details
    )?;

    create_master_edition_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMasterEditionV3 {
                edition: ctx.accounts.master_edition_account.to_account_info(),
                mint: ctx.accounts.ticket_mint.to_account_info(),
                update_authority: ctx.accounts.ticket.to_account_info(),
                mint_authority: ctx.accounts.ticket.to_account_info(),
                payer: ctx.accounts.buyer.to_account_info(),
                metadata: ctx.accounts.metadata_account.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
            signer,
        ),
        Some(0), // Max supply
    )?;

    // Initialize Ticket Account
    let ticket = &mut ctx.accounts.ticket;
    ticket.id = event.tickets_sold;
    ticket.event = event_pubkey;
    ticket.mint = ctx.accounts.ticket_mint.key();
    ticket.owner = ctx.accounts.buyer.key();
    ticket.valid_until = event.end_time;
    ticket.used = false;
    ticket.bump = ctx.bumps.ticket;

    // Update Event State
    event.tickets_sold = event
        .tickets_sold
        .checked_add(1)
        .ok_or(EventError::NumericOverflow)?;

    Ok(())
}
