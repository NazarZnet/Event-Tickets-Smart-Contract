use anchor_lang::prelude::*;

use crate::{
    constants::{EVENT_SEED, VAULT_SEED},
    errors::EventError,
    state::{Event, EventVault},
};

/// Contextual accounts required to withdraw funds and close an event.
#[derive(Accounts)]
#[instruction(event_id: u64)]
pub struct WithdrawFunds<'info> {
    /// The event account to be closed.
    #[account(
        mut,
        seeds = [EVENT_SEED, admin.key().as_ref(), event_id.to_be_bytes().as_ref()],
        bump = event.bump,
        close = admin,
    )]
    pub event: Account<'info, Event>,

    /// The event vault to be closed.
    #[account(
        mut,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump,
        close = admin,
    )]
    pub event_vault: Account<'info, EventVault>,

    /// The event administrator.
    #[account(mut, address = event.admin @ EventError::AuthorityMismatch)]
    pub admin: Signer<'info>,
}

/// Handles the logic for withdrawing event proceeds and closing the event.
///
/// # Arguments
///
/// * `ctx` - The context containing all necessary accounts.
/// * `_event_id` - The ID of the event, used for PDA validation.
///
/// # Returns
///
/// An empty `Result` indicating success or failure.
pub fn withdraw_funds_handler(ctx: Context<WithdrawFunds>, _event_id: u64) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        ctx.accounts.event.end_time < clock.unix_timestamp,
        EventError::EventNotEnded
    );
    Ok(())
}
