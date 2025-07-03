use crate::{
    constants::{DISCRIMINATOR_LENGHT, EVENT_COUNTER_SEED, EVENT_SEED, VAULT_SEED},
    errors::EventError,
    state::{Event, EventCounter},
};
use anchor_lang::prelude::*;

/// Contextual accounts required to create a new event.
#[derive(Accounts)]
pub struct CreateEvent<'info> {
    /// The event counter account, specific to the admin.
    /// It is initialized if it does not exist.
    #[account(
        init_if_needed,
        payer = admin,
        space = DISCRIMINATOR_LENGHT + EventCounter::INIT_SPACE,
        seeds = [EVENT_COUNTER_SEED, admin.key().as_ref()],
        bump
    )]
    pub event_counter: Account<'info, EventCounter>,

    /// The new event account, initialized by this instruction.
    /// The PDA is derived from the admin's key and the current event ID.
    #[account(
        init,
        payer = admin,
        space = DISCRIMINATOR_LENGHT + Event::INIT_SPACE,
        seeds = [EVENT_SEED, admin.key().as_ref(), event_counter.next_event_id.to_be_bytes().as_ref()],
        bump,
    )]
    pub event: Account<'info, Event>,

    /// The vault account for the event, which will hold ticket sale proceeds.
    /// This is a PDA initialized and owned by the program.
    #[account(
        init,
        payer = admin,
        space = DISCRIMINATOR_LENGHT,
        seeds = [VAULT_SEED, event.key().as_ref()],
        bump,
    )]
    /// CHECK: This is a PDA vault account. No data is read from it, so no ownership check is required.
    pub vault: AccountInfo<'info>,

    /// The administrator creating the event. Must be a signer.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The system program, required for creating accounts.
    pub system_program: Program<'info, System>,
}

/// Handles the logic for creating a new event.
///
/// # Arguments
///
/// * `ctx` - The context containing all necessary accounts.
/// * `name` - The name of the event.
/// * `description` - A description of the event.
/// * `start_time` - The Unix timestamp for when the event starts.
/// * `end_time` - The Unix timestamp for when the event ends.
/// * `ticket_price` - The price of one ticket in lamports.
/// * `total_tickets` - The total number of tickets available for sale.
///
/// # Returns
///
/// An empty `Result` indicating success or failure.
pub fn create_event_handler(
    ctx: Context<CreateEvent>,
    name: String,
    description: String,
    start_time: i64,
    end_time: i64,
    ticket_price: u64,
    total_tickets: u64,
) -> Result<()> {
    require!(name.len() >= 3, EventError::NameTooShort);
    require!(name.len() <= 100, EventError::NameTooLong);
    require!(description.len() <= 500, EventError::DescriptionTooLong);
    require!(end_time > start_time, EventError::InvalidEventTime);
    require!(total_tickets > 0, EventError::InvalidTicketCount);
    require!(ticket_price > 0, EventError::InvalidTicketPrice);

    // Initialize Event Counter (if new)
    let event_counter = &mut ctx.accounts.event_counter;
    if event_counter.admin == Pubkey::default() {
        event_counter.admin = ctx.accounts.admin.key();
    }

    // Initialize Event Account
    let event = &mut ctx.accounts.event;
    event.admin = ctx.accounts.admin.key();
    event.vault = ctx.accounts.vault.key();
    event.name = name;
    event.description = description;
    event.start_time = start_time;
    event.end_time = end_time;
    event.ticket_price = ticket_price;
    event.total_tickets = total_tickets;
    event.tickets_sold = 0;
    event.bump = ctx.bumps.event;

    // Increment Event Counter
    event_counter.next_event_id = event_counter
        .next_event_id
        .checked_add(1)
        .ok_or(EventError::NumericOverflow)?;

    Ok(())
}
