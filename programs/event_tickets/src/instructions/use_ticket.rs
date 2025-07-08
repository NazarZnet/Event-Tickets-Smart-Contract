use crate::{
    constants::{EVENT_SEED, TICKET_SEED},
    errors::EventError,
    state::{Event, Ticket},
};
use anchor_lang::prelude::*;

/// Contextual accounts required to mark a ticket as used.
#[derive(Accounts)]
#[instruction(event_id: u64, ticket_id: u64)]
pub struct UseTicket<'info> {
    /// The event account to which the ticket belongs.
    /// This is validated to ensure the ticket is for the correct event.
    #[account(
        seeds = [EVENT_SEED, admin.key().as_ref(), event_id.to_be_bytes().as_ref()],
        bump = event.bump,
    )]
    pub event: Account<'info, Event>,

    /// The ticket account to be marked as used.
    #[account(
        mut,
        seeds = [TICKET_SEED, event.key().as_ref(), ticket_id.to_be_bytes().as_ref()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, Ticket>,

    /// The administrator of the event. Their signature is required to authorize this action.
    #[account(mut, address = event.admin)]
    pub admin: Signer<'info>,
}

/// Handles the logic for marking a ticket as used.
///
/// This instruction can only be called by the event administrator.
/// It prevents a ticket from being used more than once.
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
pub fn use_ticket_handler(ctx: Context<UseTicket>, _event_id: u64, _ticket_id: u64) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        ctx.accounts.ticket.valid_until >= clock.unix_timestamp,
        EventError::TicketExpired
    );
    require!(!ctx.accounts.ticket.used, EventError::TicketAlreadyUsed);
    ctx.accounts.ticket.used = true;

    Ok(())
}
