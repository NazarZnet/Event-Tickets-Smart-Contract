use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{burn_checked, close_account, BurnChecked, CloseAccount},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{EVENT_SEED, TICKET_SEED, VAULT_SEED},
    errors::EventError,
    state::{Event, EventVault, Ticket},
};

/// Contextual accounts required for a buyer to return their ticket and get a refund.
#[derive(Accounts)]
#[instruction(event_id: u64, ticket_id: u64)]
pub struct ReturnTicket<'info> {
    /// The event account for which the ticket is being returned.
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
        bump,
    )]
    pub event_vault: Account<'info, EventVault>,

    /// The ticket account to be returned. It will be closed after the instruction.
    #[account(
        mut,
        seeds = [TICKET_SEED, event.key().as_ref(), ticket_id.to_be_bytes().as_ref()],
        bump = ticket.bump,
        close=signer,
    )]
    pub ticket: Account<'info, Ticket>,

    /// The ticket NFT mint account, which is a unique SPL token representing the ticket.
    #[account(
        mut,
        address=ticket.mint,
    )]
    pub ticket_mint: InterfaceAccount<'info, Mint>,

    /// The buyer who is returning the ticket. Must be the owner of the ticket.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// The buyer's Associated Token Account holding the ticket NFT.
    #[account(
        mut,
        associated_token::mint = ticket.mint,
        associated_token::authority = signer,
        associated_token::token_program=token_program
    )]
    pub signer_ticket_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// Handles the logic for returning a ticket.
///
/// This instruction validates the ticket, refunds the current holder, burns the NFT,
/// and closes the ticket account.
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
pub fn return_ticket_handler(
    ctx: Context<ReturnTicket>,
    _event_id: u64,
    _ticket_id: u64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        ctx.accounts.ticket.valid_until >= clock.unix_timestamp,
        EventError::TicketExpired
    );
    require!(!ctx.accounts.ticket.used, EventError::TicketAlreadyUsed);

    // Burn the NFT
    let cpi_accounts = BurnChecked {
        mint: ctx.accounts.ticket_mint.to_account_info(),
        from: ctx.accounts.signer_ticket_ata.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };
    burn_checked(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        1,
        0,
    )?;

    // Close the buyer's token account
    let cpi_accounts = CloseAccount {
        account: ctx.accounts.signer_ticket_ata.to_account_info(),
        destination: ctx.accounts.signer.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
    };
    close_account(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    ))?;

    // Update Event State
    ctx.accounts.event.tickets_returned = ctx
        .accounts
        .event
        .tickets_returned
        .checked_add(1)
        .ok_or(EventError::NumericOverflow)?;

    **ctx
        .accounts
        .event_vault
        .to_account_info()
        .try_borrow_mut_lamports()? -= ctx.accounts.event.ticket_price;

    **ctx
        .accounts
        .signer
        .to_account_info()
        .try_borrow_mut_lamports()? += ctx.accounts.event.ticket_price;

    Ok(())
}
