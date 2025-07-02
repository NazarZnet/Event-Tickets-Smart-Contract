use crate::{
    constants::{DISCRIMINATOR_LENGHT, EVENT_COUNTER_SEED, EVENT_SEED},
    errors::EventError,
    state::{Event, EventCounter},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateEvent<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        space = DISCRIMINATOR_LENGHT + EventCounter::INIT_SPACE,
        seeds = [EVENT_COUNTER_SEED, admin.key().as_ref()],
        bump
    )]
    pub event_counter: Account<'info, EventCounter>,

    #[account(
        init,
        payer = admin,
        space =DISCRIMINATOR_LENGHT+ Event::INIT_SPACE,
        seeds = [EVENT_SEED, admin.key().as_ref(), event_counter.next_event_id.to_be_bytes().as_ref()],
        bump,
    )]
    pub event: Account<'info, Event>,

    /// CHECK: This is a PDA vault account for the event, only used to hold SOL for the event. No data is stored, only lamports are transferred in/out by the program.
    #[account(
        init,
        payer = admin,
        space = DISCRIMINATOR_LENGHT,
        seeds = [b"vault", event.key().as_ref()],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_event_handler(
    ctx: Context<CreateEvent>,
    name: String,
    description: String,
    start_time: i64,
    end_time: i64,
    ticket_price: u64,
    total_tickets: u32,
) -> Result<()> {
    require!(name.len() >= 3, EventError::NameTooShort);
    require!(name.len() <= 100, EventError::NameTooLong);
    require!(end_time > start_time, EventError::InvalidEventTime);
    require!(total_tickets > 0, EventError::InvalidTicketCount);
    require!(ticket_price > 0, EventError::InvalidTicketPrice);
    require!(description.len() <= 500, EventError::DescriptionTooLong);

    let event_counter = &mut ctx.accounts.event_counter;
    if event_counter.admin == Pubkey::default() {
        event_counter.admin = ctx.accounts.admin.key();
    }

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

    event_counter.next_event_id = event_counter
        .next_event_id
        .checked_add(1)
        .unwrap_or_default();

    Ok(())
}
