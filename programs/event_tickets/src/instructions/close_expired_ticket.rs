use anchor_lang::prelude::*;

use crate::{
    constants::{EVENT_SEED, TICKET_SEED},
    errors::EventError,
    state::{Event, Ticket},
};

/// Contextual accounts required for an admin to close an expired ticket account.
#[derive(Accounts)]
#[instruction(event_id: u64, ticket_id: u64)]
pub struct CloseExpiredTicket<'info> {
    /// The event account.
    #[account(
        seeds = [EVENT_SEED, admin.key().as_ref(), event_id.to_be_bytes().as_ref()],
        bump ,
    )]
    pub event: Account<'info, Event>,

    /// The ticket account to be closed. The rent will be returned to the admin.
    #[account(
        mut,
        seeds = [TICKET_SEED, event.key().as_ref(), ticket_id.to_be_bytes().as_ref()],
        bump = ticket.bump,
        close = admin,
    )]
    pub ticket: Account<'info, Ticket>,

    /// The event administrator. Must be a signer and match the admin on the event account.
    #[account(mut, address = event.admin @ EventError::AuthorityMismatch)]
    pub admin: Signer<'info>,
}

/// Handles the logic for closing an expired ticket account.
///
/// This instruction allows the event admin to clean up by closing ticket PDA accounts
/// after an event has concluded, reclaiming the rent.
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

    Ok(())
}
