use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{burn_checked, close_account, BurnChecked, CloseAccount},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{EVENT_SEED, TICKET_MINT_SEED, TICKET_OWNERSHIP_SEED, TICKET_SEED},
    errors::EventError,
    state::{Event, Ticket, TicketOwnership},
};

/// Contextual accounts required for an admin to close an expired ticket account.
#[derive(Accounts)]
#[instruction(event_id: u64, ticket_id: u64)]
pub struct CloseExpiredTicket<'info> {
    /// The event account.
    #[account(
        seeds = [EVENT_SEED, admin.key().as_ref(), event_id.to_be_bytes().as_ref()],
        bump = event.bump,
    )]
    pub event: Account<'info, Event>,

    /// The ticket account to be closed. The rent will be returned to the admin.
    #[account(
        mut,
        seeds = [TICKET_SEED, event.key().as_ref(), ticket_id.to_be_bytes().as_ref()],
        bump = ticket.bump,
        close = admin, // The ticket PDA account is closed and rent returned to the admin
    )]
    pub ticket: Account<'info, Ticket>,

    /// The mint account of the ticket to be closed.
    /// This account will be closed and its rent returned to the admin.
    #[account(
        mut,
        address=ticket.mint,
        extensions::metadata_pointer::authority = ticket,
        extensions::metadata_pointer::metadata_address = ticket_mint,
        extensions::permanent_delegate::delegate = admin,
        extensions::close_authority::authority = admin,
        extensions::transfer_hook::authority= ticket,
        extensions::transfer_hook::program_id = crate::ID,
        seeds = [TICKET_MINT_SEED, event.key().as_ref(), ticket_id.to_be_bytes().as_ref()],
        bump
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    /// Additional account from transfer hook to get the mint owner
    #[account(
        mut,
        seeds = [TICKET_OWNERSHIP_SEED, ticket_mint.key().as_ref()],
        bump,
        close=admin
    )]
    pub ticket_ownership: Account<'info, TicketOwnership>,

    /// The token account (ATA) holding the ticket NFT.
    /// This account will be closed by the burn instruction.
    #[account(
        mut,
        associated_token::token_program = token_program,
        associated_token::mint = ticket_mint,
        associated_token::authority = ticket_ownership.owner,
    )]
    pub ticket_ata: InterfaceAccount<'info, TokenAccount>,

    /// The event administrator. Must be a signer and match the admin on the event account.
    /// This admin is also the permanent_delegate and close_authority for the ticket mint.
    #[account(mut, address = event.admin @ EventError::AuthorityMismatch)]
    pub admin: Signer<'info>,

    /// The SPL Token 2022 program.
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Handles the logic for closing an expired ticket account.
///
/// This instruction allows the event admin to:
/// 1. Burn the ticket NFT using its permanent_delegate authority.
/// 2. Close the ticket's mint account using its close_authority.
/// 3. Close the ticket's PDA account to reclaim rent.
///
/// This can only be done after the event has ended.
///
/// # Arguments
///
/// * `ctx` - The context containing all necessary accounts.
/// * `_event_id` - The ID of the event, used for PDA validation.
/// * `_ticket_id` - The ID of the ticket, used for PDA validation.
///
/// # Returns
///
/// An empty `Result` indicating success or failure.
pub fn close_expired_ticket_handler(
    ctx: Context<CloseExpiredTicket>,
    _event_id: u64,
    _ticket_id: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        ctx.accounts.event.end_time < clock.unix_timestamp,
        EventError::EventNotEnded
    );

    // The `admin` is the permanent_delegate for the mint and can burn the token
    // from any associated token account without needing the owner's signature.
    burn_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            BurnChecked {
                mint: ctx.accounts.ticket_mint.to_account_info(),
                from: ctx.accounts.ticket_ata.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(), // Authority is the Permanent Delegate
            },
        ),
        1,
        0,
    )?;

    // Now that the token supply is 0, the `admin` (as the Close Authority) can
    // close the mint account and reclaim its rent lamports.
    close_account(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.ticket_mint.to_account_info(),
            destination: ctx.accounts.admin.to_account_info(), // Send lamports to the admin
            authority: ctx.accounts.admin.to_account_info(),   // Authority is the Close Authority
        },
    ))?;

    // The `ticket` PDA account is closed automatically by Anchor via the `close = admin`
    // constraint on the account struct. This happens after this handler function returns Ok.

    msg!("Expired ticket, mint, and token account closed successfully.");

    Ok(())
}
