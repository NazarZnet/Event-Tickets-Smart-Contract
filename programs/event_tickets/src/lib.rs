mod constants;
mod errors;
mod instructions;
mod state;

use anchor_lang::prelude::*;

use instructions::*;

declare_id!("9iTfUKAVuJjV2Hb94LFjb1uHUcHYLvr2nXrZxiARwDdZ");

#[program]
pub mod event_tickets {
    use super::*;

    /// Creates a new event.
    ///
    /// This instruction initializes a new `Event` account, a `Vault` for storing ticket
    /// proceeds, and an `EventCounter` to track the number of events created by the admin.
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
    pub fn create_event(
        ctx: Context<CreateEvent>,
        name: String,
        description: String,
        start_time: i64,
        end_time: i64,
        ticket_price: u64,
        total_tickets: u64,
    ) -> Result<()> {
        create_event_handler(
            ctx,
            name,
            description,
            start_time,
            end_time,
            ticket_price,
            total_tickets,
        )
    }

    /// Mints a new ticket NFT for a specific event.
    ///
    /// This instruction verifies that the event is not sold out, transfers the ticket price
    /// from the buyer to the event vault, and mints a new SPL token to the buyer's wallet.
    ///
    /// # Arguments
    ///
    /// * `ctx` - The context containing all necessary accounts.
    /// * `event_id` - The unique ID of the event for which to mint the ticket.
    pub fn mint_ticket(ctx: Context<MintTicket>, event_id: u64) -> Result<()> {
        mint_ticket_handler(ctx, event_id)
    }
}
