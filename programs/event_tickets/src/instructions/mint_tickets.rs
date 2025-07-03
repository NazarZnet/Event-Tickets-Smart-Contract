use crate::{
    constants::{DISCRIMINATOR_LENGHT, EVENT_SEED, TICKET_MINT_SEED, TICKET_SEED},
    errors::EventError,
    state::{Event, Ticket},
};
use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, MintTo, Token, TokenAccount},
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
    #[account(mut, address = event.vault)]
    /// CHECK: This is a PDA vault account. The address is verified against the event account.
    pub event_vault: AccountInfo<'info>,

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
        mint::authority = ticket, // The ticket PDA is the mint authority
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

    // --- Required Programs ---
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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

    let price = event.ticket_price;
    let buyer_lamports = **ctx.accounts.buyer.to_account_info().lamports.borrow();
    require!(buyer_lamports >= price, EventError::InsufficientFunds);

    // Payment Transfer
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.event_vault.to_account_info(),
            },
        ),
        price,
    )?;

    // NFT Minting
    let cpi_accounts = MintTo {
        mint: ctx.accounts.ticket_mint.to_account_info(),
        to: ctx.accounts.buyer_ticket_ata.to_account_info(),
        authority: ctx.accounts.ticket.to_account_info(),
    };
    let event_pubkey = event.key();
    let seeds = &[
        TICKET_SEED,
        event_pubkey.as_ref(),
        &event.tickets_sold.to_be_bytes(),
        &[ctx.bumps.ticket],
    ];
    let signer = &[&seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    anchor_spl::token::mint_to(cpi_ctx, 1)?;

    // Initialize Ticket Account
    let ticket = &mut ctx.accounts.ticket;
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
